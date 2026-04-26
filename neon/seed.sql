insert into public.settings (key, value)
values
  ('bus_p1_date', null),
  ('bus_p2_date', null),
  ('psy_p1_date', null),
  ('psy_p2_date', null)
on conflict (key) do nothing;
