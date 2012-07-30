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
        this.bus = bus;
        this.map = map;
        this.index = index;
        this.bounds = new google.maps.LatLngBounds();
        this.cdb = null;
        this.infowindow = new CartoDBInfowindow(this.map);
      },
      
      start: function () {
        var self = this,
        pos = google.maps.ControlPosition.TOP_RIGHT;
        
        
        this.display = new vertnet.layer.Display();
        this.display.toggle(true);
        this.map.controls[pos].push(this.display[0]);
        this.cdb = new CartoDBLayer(
          {
            map: this.map,
            user_name:'vertnet',
            table_name: 'occ',
            query: "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, o._classs as class "
              + "FROM loc, tax t, tax_loc l, occ o "
              + "WHERE t.tax_id = l.tax_id "
              + "AND loc.loc_id = l.loc_id "
              + "AND o.tax_loc_id = l.tax_loc_id",
            layer_order: "top",
            interactivity: "cartodb_id, name, class",
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
                str += $(this).text();
              });
            self.update(str);
          }).change();                    
      },
      
      update: function(className) {
        var sql = "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, o._classs as class " + 
          "FROM loc, tax t, tax_loc l, occ o " + 
          "WHERE t.tax_id = l.tax_id AND " +
          "loc.loc_id = l.loc_id AND " +
          "o.tax_loc_id = l.tax_loc_id AND " +
          "lower(o._classs) = '{0}' ",
        self = this;;
        
        if (className === '') {
          return;
        }
        if (className === 'All Classes') {
          sql = "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, o._classs as class "
            + "FROM loc, tax t, tax_loc l, occ o "
            + "WHERE t.tax_id = l.tax_id "
            + "AND loc.loc_id = l.loc_id "
            + "AND o.tax_loc_id = l.tax_loc_id";
        } else if (className === 'All Points') {
          sql = "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, 'Unknown' as \"class\"  "
            + "FROM loc, tax t, tax_loc l "
            + "where t.tax_id = l.tax_id and loc.loc_id = l.loc_id";
        } else {
          sql = sql.format(className.toLowerCase());                   
        }
        this.cdb.setMap(null);
        this.cdb = new CartoDBLayer(
          {
            map: this.map,
            user_name:'vertnet',
            table_name: 'occ',
            query: sql,
            layer_order: "top",
            interactivity: "cartodb_id, name, class",
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
