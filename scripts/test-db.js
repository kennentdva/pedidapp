import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://hvhxdsukldgezqwtlwcc.supabase.co',
  'sb_publishable_-A2tJZgxAoAmPwoe1xLSzA_7dnN02Xn'
)

async function test() {
  const testString = 'a'.repeat(500);
  const { data, error } = await supabase.from('clientes').insert([{ nombre: 'TEST_LONG_' + testString, es_frecuente: false }]).select();
  console.log("Error:", error);
  console.log("Data:", data);
  if(data) {
     await supabase.from('clientes').delete().eq('id', data[0].id);
  }
}

test();
