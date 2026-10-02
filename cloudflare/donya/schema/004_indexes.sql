CREATE INDEX IF NOT EXISTS nail_2nya_appt_customer_idx ON nail_2nya_appointments(customer_id);
CREATE INDEX IF NOT EXISTS nail_2nya_appt_service_idx ON nail_2nya_appointments(service_id);
CREATE INDEX IF NOT EXISTS nail_2nya_appt_start_idx ON nail_2nya_appointments(start_at);
CREATE INDEX IF NOT EXISTS nail_2nya_appt_status_idx ON nail_2nya_appointments(status,start_at);
CREATE INDEX IF NOT EXISTS nail_2nya_appt_created_by_idx ON nail_2nya_appointments(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS nail_2nya_appt_overlap_idx ON nail_2nya_appointments(status,reserved_start_at,reserved_end_at);
CREATE INDEX IF NOT EXISTS nail_2nya_block_created_by_idx ON nail_2nya_blocked_periods(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS nail_2nya_block_range_idx ON nail_2nya_blocked_periods(start_at,end_at);
CREATE INDEX IF NOT EXISTS nail_2nya_hours_weekday_idx ON nail_2nya_business_hours(weekday) WHERE active = 1;
CREATE INDEX IF NOT EXISTS nail_2nya_customer_push_appointment_idx ON nail_2nya_customer_push_subscriptions(appointment_id) WHERE active = 1;
CREATE INDEX IF NOT EXISTS nail_2nya_special_date_idx ON nail_2nya_special_availability(availability_date);

-- Appointment overlap protection is enforced in Worker service logic during the backend migration phase.
-- PostgreSQL used a GiST exclusion constraint. D1 does not provide an equivalent native range constraint.
END;
