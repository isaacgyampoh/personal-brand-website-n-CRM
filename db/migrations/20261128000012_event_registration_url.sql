-- Optional external registration page (e.g. a ticket shop) used while online payments
-- are not set up on this site. When set, "Register" buttons go there. Additive only.
alter table events add column registration_url text
  check (registration_url is null or registration_url ~ '^https://[^\s]+$');
