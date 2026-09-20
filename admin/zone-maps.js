/* Shared map adapter. Google Places results are shown only on a Google map. */
const ZoneMaps = (() => {
  let googleLoading;
  function contains(ring,lat,lng){
    if(!Array.isArray(ring)||ring.length<3)return false;
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [ay,ax]=ring[j], [by,bx]=ring[i];
      const cross=(lng-ax)*(by-ay)-(lat-ay)*(bx-ax);
      if(Math.abs(cross)<1e-10 && lng>=Math.min(ax,bx)-1e-10 && lng<=Math.max(ax,bx)+1e-10
        && lat>=Math.min(ay,by)-1e-10 && lat<=Math.max(ay,by)+1e-10)return true;
      if((ay>lat)!==(by>lat)&&lng<(bx-ax)*(lat-ay)/(by-ay)+ax)inside=!inside;
    }
    return inside;
  }
  async function googleAPI(){
    if(window.google?.maps?.importLibrary)return window.google;
    if(!window.HTPWEB_MAPS?.googleKey)return null;
    if(!googleLoading)googleLoading=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      const callback="htpMapsReady";
      window[callback]=()=>{delete window[callback];resolve(window.google);};
      window.gm_authFailure=()=>{window.dispatchEvent(new CustomEvent("htp-google-auth-failure"));};
      script.src="https://maps.googleapis.com/maps/api/js?"+new URLSearchParams({
        key:window.HTPWEB_MAPS.googleKey,libraries:"places,marker",v:"quarterly",callback,loading:"async",language:"es",region:"EC"
      });
      script.onerror=()=>reject(new Error("No se pudo cargar Google Maps. Comprueba conexión, API y restricciones."));
      setTimeout(()=>{if(!window.google?.maps)reject(new Error("Google Maps no respondió."));},15000);
      document.head.append(script);
    });
    return googleLoading;
  }
  async function create(id,onClick){
    const center=window.HTPWEB_MAPS?.defaultCenter||[0.9592,-79.6539];
    const g=await googleAPI(); let shapes=[],markers=[];
    if(g){
      const map=new g.maps.Map(document.getElementById(id),{center:{lat:center[0],lng:center[1]},zoom:12,streetViewControl:false});
      map.addListener("click",e=>onClick?.(e.latLng.lat(),e.latLng.lng()));
      return {google:true,map,
        center:(p,zoom=16)=>{map.setCenter({lat:p[0],lng:p[1]});map.setZoom(zoom);},
        resize:()=>g.maps.event.trigger(map,"resize"),
        clear:()=>{[...shapes,...markers].forEach(x=>x.setMap(null));shapes=[];markers=[];},
        polygon:(ring,color)=>{const p=new g.maps.Polygon({map,paths:ring.map(p=>({lat:p[0],lng:p[1]})),strokeColor:color,fillColor:color,fillOpacity:.13,clickable:false});shapes.push(p);},
        marker:(p,onMove)=>{const m=new g.maps.Marker({map,position:{lat:p[0],lng:p[1]},draggable:!!onMove});
          if(onMove)m.addListener("dragend",e=>onMove(e.latLng.lat(),e.latLng.lng()));markers.push(m);return m;},
        destroy:()=>{g.maps.event.clearInstanceListeners(map);document.getElementById(id).replaceChildren();}
      };
    }
    if(!window.L)throw new Error("No se pudo cargar el mapa. Revisa tu conexión y vuelve a abrir la ficha.");
    const map=L.map(id).setView(center,12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
    const layer=L.layerGroup().addTo(map);
    map.on("click",e=>onClick?.(e.latlng.lat,e.latlng.lng));
    return {google:false,map,center:(p,z=16)=>map.setView(p,z),resize:()=>map.invalidateSize(),
      clear:()=>layer.clearLayers(),polygon:(ring,color)=>L.polygon(ring,{color,weight:2,fillOpacity:.13,interactive:false}).addTo(layer),
      marker:(p,onMove)=>{const m=L.marker(p,{draggable:!!onMove}).addTo(layer);
        if(onMove)m.on("dragend",()=>onMove(m.getLatLng().lat,m.getLatLng().lng));return m;},
      destroy:()=>map.remove()};
  }
  return {contains,create,googleAPI};
})();
if(typeof module!=="undefined")module.exports=ZoneMaps;
