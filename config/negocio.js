let negocio=null;

async function cargarNegocio(){
  const params=new URLSearchParams(window.location.search);
  const slug=params.get("cliente");

  if(!slug) throw new Error("No se especificó el cliente.");

  const {data,error}=await supabase
    .from("clientes")
    .select("id,nombre,slug,logo_url,activo")
    .eq("slug",slug)
    .eq("activo",true)
    .single();

  if(error||!data) throw new Error("Cliente no encontrado.");

  negocio=data;
  return negocio;
}
