create table if not exists hr_leave_request (
  pk_leave_id      bigserial primary key,
  tenant_id        bigint not null references frs_tenant(pk_tenant_id),
  fk_employee_id   bigint not null references hr_employee(pk_employee_id),
  leave_type       varchar(60) not null,
  start_date       date not null,
  end_date         date not null,
  days             int not null default 1,
  reason           text,
  status           varchar(20) not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  approved_by      bigint references frs_user(pk_user_id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
