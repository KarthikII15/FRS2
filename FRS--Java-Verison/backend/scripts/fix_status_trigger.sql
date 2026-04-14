CREATE OR REPLACE FUNCTION public.log_device_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Only log if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO device_status_history (
            device_id,
            old_status,
            new_status,
            transition_reason,
            duration_seconds,
            additional_data
        ) VALUES (
            NEW.pk_device_id,
            COALESCE(OLD.status, 'unknown'),
            NEW.status,
            COALESCE(NEW.device_notes, 'system_triggered'),
            EXTRACT(EPOCH FROM (NOW() - COALESCE(OLD.last_active, NOW())))::INTEGER,
            jsonb_build_object(
                'ip_address', NEW.ip_address,
                'last_heartbeat', NEW.last_heartbeat,
                'offline_since', NEW.offline_since
            )
        );
    END IF;
    
    RETURN NEW;
END;
$function$;
