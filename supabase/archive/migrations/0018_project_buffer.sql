-- Fever-chart buffer, set per project. Null means the 10-day demo buffer.
alter table projects add column if not exists buffer_days int check (buffer_days is null or buffer_days > 0);
