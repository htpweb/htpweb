/* HTPWEB shared map adapter.
   Código 104: OpenStreetMap + Leaflet is the primary and only runtime map provider.
   Google Maps is no longer required for LOCAL or ZONE visualization. */
const ZoneMaps = (() => {
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

  // Kept only as a compatibility shim for old code paths. It intentionally
  // does not load Google scripts or make billable requests.
  async function googleAPI(){ return null; }

  async function create(id,onClick){
    const center=window.HTPWEB_MAPS?.defaultCenter||[0.9592,-79.6539];
    if(!window.L)throw new Error("No se pudo cargar OpenStreetMap. Revisa tu conexión y vuelve a abrir la ficha.");

    const el=document.getElementById(id);
    if(!el)throw new Error("No se encontró el contenedor del mapa.");

    const map=L.map(id,{zoomControl:true}).setView(center,12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    const layer=L.layerGroup().addTo(map);
    map.on("click",e=>onClick?.(e.latlng.lat,e.latlng.lng));

    return {
      google:false,
      provider:"OPENSTREETMAP",
      map,
      center:(p,z=16)=>map.setView(p,z),
      resize:()=>map.invalidateSize(),
      clear:()=>layer.clearLayers(),
      polygon:(ring,colorOrOptions,onClick)=>{
        const options=typeof colorOrOptions==="string"
          ? {color:colorOrOptions,weight:2,fillOpacity:.13,interactive:false}
          : {
              color:colorOrOptions?.color||"#2563eb",
              fillColor:colorOrOptions?.fillColor||colorOrOptions?.color||"#2563eb",
              weight:colorOrOptions?.weight??2,
              fillOpacity:colorOrOptions?.fillOpacity??.13,
              opacity:colorOrOptions?.opacity??1,
              interactive:colorOrOptions?.interactive??Boolean(onClick)
            };
        const polygon=L.polygon(ring,options).addTo(layer);
        if(onClick)polygon.on("click",e=>{
          L.DomEvent.stopPropagation(e);
          onClick(e);
        });
        return polygon;
      },
      fit:(rings,padding=24)=>{
        const points=(Array.isArray(rings)?rings:[])
          .flatMap(ring=>Array.isArray(ring?.[0])?ring:[ring])
          .filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1])));
        if(!points.length)return;
        const bounds=L.latLngBounds(points.map(p=>[Number(p[0]),Number(p[1])]));
        if(bounds.isValid())map.fitBounds(bounds,{padding:[padding,padding]});
      },
      marker:(p,onMove)=>{
        const m=L.marker(p,{draggable:!!onMove}).addTo(layer);
        if(onMove)m.on("dragend",()=>onMove(m.getLatLng().lat,m.getLatLng().lng));
        return m;
      },
      destroy:()=>map.remove()
    };
  }

  return {contains,create,googleAPI};
})();
if(typeof module!=="undefined")module.exports=ZoneMaps;
