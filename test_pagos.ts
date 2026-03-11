import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hvhxdsukldgezqwtlwcc.supabase.co',
  'eyJh... // wait, the anon key is the public one'
);
// I can just import from src/lib/supabase
