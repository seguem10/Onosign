-- Hotel catalogue sourced from ONOMO's public hotel directory, checked 2026-10-10.
-- Source: https://www.onomohotels.com/hotel/
-- Preserve existing workspaces, memberships, and test data. No accounts are created.
insert into public.workspaces (organization_id,name,type,country_code)
values
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'Le Square by ONOMO Collection', 'hotel', 'MA'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Allure Abidjan Baobab', 'hotel', 'CI'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Allure Abuja AATC Hotel', 'hotel', 'NG'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Abidjan Airport', 'hotel', 'CI'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Bamako', 'hotel', 'ML'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Cape Town - Inn On The Square', 'hotel', 'ZA'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Cape Town Foreshore', 'hotel', 'ZA'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Cape Town Waterfront', 'hotel', 'ZA'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Casablanca Airport', 'hotel', 'MA'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Casablanca City Center', 'hotel', 'MA'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Casablanca Sidi Maarouf', 'hotel', 'MA'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Conakry', 'hotel', 'GN'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Dakar', 'hotel', 'SN'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Dar Es Salaam', 'hotel', 'TZ'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Douala', 'hotel', 'CM'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Durban', 'hotel', 'ZA'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Johannesburg Sandton', 'hotel', 'ZA'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Kampala', 'hotel', 'UG'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Kigali', 'hotel', 'RW'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Lomé', 'hotel', 'TG'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Maputo', 'hotel', 'MZ'),
  ('4c40b483-3353-4f4c-9291-550effbb9d43', 'ONOMO Hotel Rabat Terminus', 'hotel', 'MA')
on conflict (organization_id,name) do nothing;
