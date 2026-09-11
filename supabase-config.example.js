/* =========================================================
   Conexion a Supabase.

   Completar con los datos del proyecto:
   Supabase -> Project Settings -> Data API
     URL       -> Project URL
     ANON_KEY  -> la clave publica (anon / publishable)

   La anon key esta pensada para vivir en el cliente: no es un
   secreto, y lo que se puede hacer con ella lo definen las
   politicas de RLS del schema.

   NUNCA poner aca la service_role key: esa ignora RLS y le da
   control total de la base a cualquiera que abra el navegador.
   ========================================================= */

window.SUPABASE_CONFIG = {
  URL: 'https://TU-PROYECTO.supabase.co',
  ANON_KEY: 'TU-ANON-KEY'
};
