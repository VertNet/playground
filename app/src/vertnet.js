function VertNet() {
  var args = Array.prototype.slice.call(arguments),
      callback = args.pop(),
      modules = (args[0] && typeof args[0] === "string") ? args : args[0],        
      i,
      m,
      mod,
      submod;
  if (!(this instanceof VertNet)) {
    return new VertNet(modules, callback);
  }  
  if (!modules || modules === '*') {
    modules = [];
    for (i in VertNet.modules) {
      if (VertNet.modules.hasOwnProperty(i)) {
        modules.push(i);
      }
    }
  }
  for (i = 0; i < modules.length; i += 1) {
    m = modules[i];
    VertNet.modules[m](this);            
    if (this[m].hasOwnProperty('submodules')) {
      for (submod in this[m].submodules) {
        VertNet.modules[m][this[m]['submodules'][submod]](this);
      }
    }
  }
  callback(this);
  return this;
};

String.prototype.format = function(i, safe, arg) {
  function format() {
    var str = this, 
        len = arguments.length+1;
    
    for (i=0; i < len; arg = arguments[i++]) {
      safe = typeof arg === 'object' ? JSON.stringify(arg) : arg;
      str = str.replace(RegExp('\\{'+(i-1)+'\\}', 'g'), safe);
    }
    return str;
  }
  format.native = String.prototype.format;
  return format;
}();

VertNet.modules = {};

VertNet.modules.mvp = function(vertnet) {
  vertnet.mvp = {};
  vertnet.mvp.Engine = Class.extend(
    {
      start: function(container) {
      },
      
      go: function(place) {
      },
      
      state: function() {
      }
    }
  );
  vertnet.mvp.View = Class.extend(
    {
      init: function(element, parent) {
        if (!element) {
          element = '<div>';
        }
        _.extend(this, $(element));
        this.element = this[0];
        if (parent) {
          $(parent).append(this.element);
        }
      }
    }
  );
  vertnet.mvp.Display = vertnet.mvp.View.extend(
    {
      init: function(element, parent) {
        this._super(element, parent);
      },
      
      engine: function(engine) {
        this.engine = engine;
      }
    }
  );
};

VertNet.modules.app = function (vertnet) {
  vertnet.app = {};
  vertnet.app.Instance = Class.extend(
    {
      init: function (logging) {
        this.layers = {};
        vertnet.log.enabled = logging ? logging : false;
      },
      addLayer: function (map, options) {
        var layer = new vertnet.layer.Engine(map, options);
        return layer;
      }
    }
  );
};

VertNet.modules.layer = function (vertnet) {    
  vertnet.layer = {};
  vertnet.layer.Engine = vertnet.mvp.Engine.extend(
    {
      init: function (bus, map, index) {
        var self = this;
        this.parseUrl();
        this.bus = bus;
        this.map = map;
        this.index = index;
        this.bounds = new google.maps.LatLngBounds();
        this.cdb = null;
        this.infowindow = new CartoDBInfowindow(this.map);
        this.search = new vertnet.layer.SearchDisplay();
        this.search.toggle(true);
        this.initAutocomplete();
        this.searching = {};
        this.names = [];
        
        this.search.goButton.click(
          function(event) {
				self.update(self.search.searchBox.val(), true);
          }
        );

        this.search.searchBox.keyup(
          function(event) {
            if (event.keyCode === 13) {
              $(this).autocomplete("close");
              self.update($(this).val(), true);
            }
          }
        );
      },

      initAutocomplete: function() {
        this.populateAutocomplete(null, null);

        $.ui.autocomplete.prototype._renderItem = function (ul, item) {

          item.label = item.label.replace(
            new RegExp("(?![^&;]+;)(?!<[^<>]*)(" +
                       $.ui.autocomplete.escapeRegex(this.term) +
                       ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<strong>$1</strong>");
          return $('<li></li>')
            .data("item.autocomplete", item)
            .append("<a>" + item.label + "</a>")
            .appendTo(ul);
        };
      },

      populateAutocomplete : function(action, response) {
		  var self = this;
        $(this.search.searchBox).autocomplete(
          {
            minLength: 3, // Note: Auto-complete indexes are min length 3.
            source: function(request, response) {
              $.get(
                'http://vertnet.cartodb.com/api/v2/sql',
                {
                  q:"SELECT name from tax where lower(name)~*'\\m{0}'".format(request.term)
                },
                function (json) {
                  var names = [],scinames=[];
                  _.each (
                    json.rows,
                    function(row) {
                      var sci, eng;
                      if(row.name != undefined){
                        sci = row.name;
                        names.push({label:'<div class="ac-item">{0}</div>'.format(sci), value:sci});
                        scinames.push(sci)

                      }
                    }
                  );
                  if(scinames.length>0) {
                    self.names=scinames;
                  }
                  response(names);
                  //self.bus.fireEvent(new mol.bus.Event('hide-loading-indicator', {source : "autocomplete"}));
                },
                'json'
              );
            },

            select: function(event, ui) {
              self.searching[ui.item.value] = false;
              self.names = [ui.item.value];
              self.update(ui.item.value, true);
            },
            close: function(event,ui) {

            },
            search: function(event, ui) {
              self.searching[$(this).val()] = true;
              self.names=[];
              //self.bus.fireEvent(new mol.bus.Event('show-loading-indicator', {source : "autocomplete"}));
            },
            open: function(event, ui) {
              self.searching[$(this).val()] = false;
              //self.bus.fireEvent(new mol.bus.Event('hide-loading-indicator', {source : "autocomplete"}));
            }
          });
      },
      
      parseUrl: function() {
        var a = /\+/g,  // Regex for replacing addition symbol with a space
        r = /([^&=]+)=?([^&]*)/g,
        d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
        q = window.location.search.substring(1);
        
        this.urlParams = {};
        
        // Parses URL parameters:
        while ((e = r.exec(q))) {
          this.urlParams[d(e[1])] = d(e[2]);
        };
      },

      start: function () {
        var self = this,
        pos = google.maps.ControlPosition.TOP_RIGHT,
        sql = this.urlParams['sql'];
        

        this.display = new vertnet.layer.Display();
        this.display.toggle(true);
        this.map.controls[pos].push(this.display[0]);
        this.map.controls[pos].push(this.search[0]);

        this.cdb = new CartoDBLayer(
          {
            map: this.map,
            user_name:'vertnet',
            table_name: 'occ',
            query: sql ? sql : "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, o._classs as class, o.catalognumber, o.icode "
              + "FROM loc, tax t, taxloc l, occ o "
              + "WHERE t.tax_id = l.tax_id "
              + "AND loc.loc_id = l.loc_id "
              + "AND o.tax_loc_id = l.tax_loc_id",
            layer_order: "top",
            interactivity: "cartodb_id, name, class, catalognumber, icode",
            featureClick: function(feature, latlng, pos, data) {
              self.infowindow.setContent(data);
              self.infowindow.setPosition(latlng);
              self.infowindow.open();
            },
            featureOut: function() {
              self.map.setOptions({draggableCursor:null});
            },
            featureOver: function(feature, latlng, pos, data) {
              self.map.setOptions({draggableCursor:'pointer'});
            },
            auto_bound: false
          }
        );
        this.wireHandler();
      },
      
      wireHandler: function() {
        var self = this;
        
        $(this.display).change(
          function () {
            var str = "";
            $("select option:selected").each(
              function () {
                //str += $(this).text();
                str += this.value;
              });
            self.update(str);
          }).change();       
      },
      
      update: function(name, sciname) {
        var csql = "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, o._classs as class, o.catalognumber, o.icode " + 
          "FROM loc, tax t, taxloc l, occ o " + 
          "WHERE t.tax_id = l.tax_id AND " +
          "loc.loc_id = l.loc_id AND " +
          "o.tax_loc_id = l.tax_loc_id AND " +
          "lower(o._classs) = '{0}' ",
        isql = "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, o._classs as class, o.catalognumber, o.icode " + 
          "FROM loc, tax t, taxloc l, occ o " + 
          "WHERE t.tax_id = l.tax_id AND " +
          "loc.loc_id = l.loc_id AND " +
          "o.tax_loc_id = l.tax_loc_id AND " +
          "lower(o.icode) = '{0}' ",
        snsql = "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, o._classs as class, o.catalognumber, o.icode " + 
          "FROM loc, tax t, taxloc l, occ o " + 
          "WHERE t.tax_id = l.tax_id AND " +
          "loc.loc_id = l.loc_id AND " +
          "o.tax_loc_id = l.tax_loc_id AND " +
          "t.name = '{0}' ",
        self = this,
        type = null,
        sql = this.urlParams['sql'];

        if (name === 'nop') {
          return;
        }

        if (name.split('i-').length === 2) {
          type = 'icode';
          name = name.split('i-')[1];
        } else {
          type = 'class'
        }
        
        if (name === '' && sql === undefined) {
          return;
        }
        if (name === 'all') {
          sql = "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, o._classs as class, o.catalognumber, o.icode "
            + "FROM loc, tax t, taxloc l, occ o "
            + "WHERE t.tax_id = l.tax_id "
            + "AND loc.loc_id = l.loc_id "
            + "AND o.tax_loc_id = l.tax_loc_id";
        } else if (name === 'A') {
          sql = "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, 'Unknown' as \"class\", o.catalognumber, o.icode  "
            + "FROM loc, tax t, tax_loc l "
            + "where t.tax_id = l.tax_id and loc.loc_id = l.loc_id";
        } else if (type === 'icode') {
          sql = sql ? sql : isql.format(name.toLowerCase());                   
        } else {
          sql = sql ? sql : csql.format(name.toLowerCase());
        }
        
        if (sciname) {
          sql = snsql.format(name.trim());
        }

        this.cdb.setMap(null);
        this.cdb = new CartoDBLayer(
          {
            map: this.map,
            user_name:'vertnet',
            table_name: 'occ',
            query: sql,
            layer_order: "top",
            interactivity: "cartodb_id, name, class, catalognumber, icode",
            featureClick: function(feature, latlng, pos, data) {
              self.infowindow.setContent(data);
              self.infowindow.setPosition(latlng);
              self.infowindow.open();
            },
            featureOut: function() {
              self.map.setOptions({draggableCursor:null});
            },
            featureOver: function(feature, latlng, pos, data) {
              self.map.setOptions({draggableCursor:'pointer'});
            },
            auto_bound: false
          }
        );
      }
    }
  );

  vertnet.layer.SearchDisplay = vertnet.mvp.View.extend(
    {
      init: function() {
        var html = '' +
          '<div class="title ui-autocomplete-input">' +
          '    <input id="value" type="text" placeholder="Search by species name">' +
          '    <button id="execute">Go</button>' +
          '</div>';

        this._super(html);
        this.goButton = $(this).find('#execute');
        this.searchBox = $(this).find('#value');
      },

      clear: function() {
        this.searchBox.html('');
      }
    }
  ),
  
  vertnet.layer.Display = vertnet.mvp.View.extend(
    {
      init: function() {
        var html = '' +
          '<div class="LayerDisplay">' +
          '  <select>' +
          '     <option value="all">All Classes</option>' +              
          '     <option value="Actinopterygii">Actinopterygii</option>' +    
          '     <option value="Amphibia">Amphibia</option>' +
          '     <option value="Aves">Aves</option>' +
          '     <option value="Elasmobranchii">Elasmobranchii</option>' +    
          '     <option value="Holocephali">Holocephali</option>' +                  
          '     <option value="Mammalia">Mammalia</option>' +
          '     <option value="Reptilia">Reptilia</option>' +
          '     <option value="nop">................</option>' +
          '     <option value="i-CAS">CAS</option>' +
          '     <option value="i-CMC">CMC</option>' +
          '     <option value="i-CRCM">CRCM</option>' +
          '     <option value="i-DMNH">DMNH</option>' +
          '     <option value="i-FLMNH">FLMNH</option>' +
          '     <option value="i-FMNH">FMNH</option>' +
          '     <option value="i-HSU">HSU</option>' +
          '     <option value="i-ISU">ISU</option>' +
          '     <option value="i-KUBI">KUBI</option>' +
          '     <option value="i-MPM">MPM</option>' +
          '     <option value="i-NMMNH">NMMNH</option>' +
          '     <option value="i-NYSM">NYSM</option>' +
          '     <option value="i-SMNS">SMNS</option>' +
          '     <option value="i-TCWC">TCWC</option>' +
          '     <option value="i-TTRS">TTRS</option>' +
          '     <option value="i-UBC">UBC</option>' +
          '     <option value="i-UNR">UNR</option>' +
          '     <option value="i-WFVZ">WFVZ</option>' +
          '  </select>' +
          '</div>';
        this._super(html);
      }
    }
  );
};

VertNet.modules.map = function(vertnet) {

  vertnet.map = {};
  vertnet.map.Engine = vertnet.mvp.Engine.extend(
    {
      init: function(api, bus) {
        this.api = api;
        this.bus = bus;
      },            
      start: function(container) {
        this.display = new vertnet.map.Display(container);
        this.map = this.display.map;
      },
      go: function(place) {
      },

      place: function() {
      }
    }
  );
  vertnet.map.Display = vertnet.mvp.View.extend(
    {
      init: function(element) {
        var mapOptions = null;

        this._super(element);

        mapOptions = {
          zoom: 3,
          maxZoom: 10,
          minZoom: 2,
          minLat: -85,
          maxLat: 85,
          mapTypeControl: false,
          center: new google.maps.LatLng(0,-50),
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          styles: [
            {
              featureType: "administrative",
              stylers: [
                { visibility: "on" }
              ]
            },
            {
              featureType: "administrative.locality",
              stylers: [
                { visibility: "off" }
              ]
            },
            {
              featureType: "landscape",
              stylers: [
                { visibility: "off" }
              ]
            },
            {
              featureType: "road",
              stylers: [
                { visibility: "off" }
              ]
            },
            {
              featureType: "poi",
              stylers: [
                { visibility: "off" }
              ]
            },{
              featureType: "water",
              stylers: [
                { visibility: "on" },
                { saturation: -65 },
                { lightness: -15 },
                { gamma: 0.83 }
              ]
            },
            {
              featureType: "transit",
              stylers: [
                { visibility: "off" }
              ]
            },{
              featureType: "administrative",
              stylers: [
                { visibility: "on" }
              ]
            },{
              featureType: "administrative.country",
              stylers: [
                { visibility: "on" }
              ]
            },{
              featureType: "administrative.province",
              stylers: [
                { visibility: "on" }
              ]
            }
          ]
        };

        this.map = new google.maps.Map(this.element, mapOptions);
      }
    }
  );
};
