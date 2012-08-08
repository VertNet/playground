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
            query: "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, o._classs as class, o.catalognumber, o.icode "
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
      
      update: function(name) {
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
        self = this,
        type = null,
        sql = null;

        if (name.split('i-').length === 2) {
          type = 'icode';
          name = name.split('i-')[1];
        } else {
          type = 'class'
        }
        
        if (name === '') {
          return;
        }
        if (name === 'All Classes') {
          sql = "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, o._classs as class, o.catalognumber, o.icode "
            + "FROM loc, tax t, taxloc l, occ o "
            + "WHERE t.tax_id = l.tax_id "
            + "AND loc.loc_id = l.loc_id "
            + "AND o.tax_loc_id = l.tax_loc_id";
        } else if (name === 'All Points') {
          sql = "SELECT loc.the_geom, loc.the_geom_webmercator, t.cartodb_id, t.name, 'Unknown' as \"class\", o.catalognumber, o.icode  "
            + "FROM loc, tax t, tax_loc l "
            + "where t.tax_id = l.tax_id and loc.loc_id = l.loc_id";
        } else if (type === 'icode') {
          sql = isql.format(name.toLowerCase());                   
        } else {
          sql = csql.format(name.toLowerCase());
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
