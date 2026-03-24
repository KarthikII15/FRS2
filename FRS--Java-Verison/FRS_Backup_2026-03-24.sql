--
-- PostgreSQL database dump
--

-- Dumped from database version 15.4 (Debian 15.4-2.pgdg120+1)
-- Dumped by pg_dump version 15.4 (Debian 15.4-2.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: sync_face_enrolled(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_face_enrolled() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE hr_employee
      SET face_enrolled = TRUE
      WHERE pk_employee_id = NEW.employee_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE hr_employee
      SET face_enrolled = (
        EXISTS (
          SELECT 1 FROM employee_face_embeddings
          WHERE employee_id = OLD.employee_id
        )
      )
      WHERE pk_employee_id = OLD.employee_id;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION public.sync_face_enrolled() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attendance_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_events (
    pk_attendance_event_id bigint NOT NULL,
    fk_employee_id bigint,
    fk_device_id uuid,
    fk_original_event_id uuid,
    event_type character varying(50) NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    confidence_score double precision,
    verification_method character varying(50),
    recognition_model_version character varying(50),
    frame_image_url text,
    face_bounding_box jsonb,
    location_zone character varying(120),
    entry_exit_direction character varying(20),
    fk_shift_id bigint,
    is_expected_entry boolean,
    is_on_time boolean,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.attendance_events OWNER TO postgres;

--
-- Name: attendance_events_pk_attendance_event_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_events_pk_attendance_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.attendance_events_pk_attendance_event_id_seq OWNER TO postgres;

--
-- Name: attendance_events_pk_attendance_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_events_pk_attendance_event_id_seq OWNED BY public.attendance_events.pk_attendance_event_id;


--
-- Name: attendance_record; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_record (
    pk_attendance_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    customer_id bigint,
    site_id bigint,
    unit_id bigint,
    fk_employee_id bigint NOT NULL,
    attendance_date date NOT NULL,
    check_in timestamp with time zone,
    check_out timestamp with time zone,
    break_start timestamp with time zone,
    break_end timestamp with time zone,
    status character varying(20) NOT NULL,
    working_hours numeric(8,2) DEFAULT 0 NOT NULL,
    break_duration_minutes integer DEFAULT 0 NOT NULL,
    overtime_hours numeric(8,2) DEFAULT 0 NOT NULL,
    is_late boolean DEFAULT false NOT NULL,
    is_early_departure boolean DEFAULT false NOT NULL,
    device_id character varying(80),
    location_label character varying(180),
    recognition_accuracy numeric(5,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    frame_url text,
    recognition_confidence double precision,
    duration_minutes integer,
    checkin_frame_url text,
    checkout_frame_url text,
    CONSTRAINT attendance_record_status_check CHECK (((status)::text = ANY ((ARRAY['present'::character varying, 'late'::character varying, 'absent'::character varying, 'on-leave'::character varying, 'on-break'::character varying])::text[])))
);


ALTER TABLE public.attendance_record OWNER TO postgres;

--
-- Name: attendance_record_pk_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_record_pk_attendance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.attendance_record_pk_attendance_id_seq OWNER TO postgres;

--
-- Name: attendance_record_pk_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_record_pk_attendance_id_seq OWNED BY public.attendance_record.pk_attendance_id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_log (
    pk_audit_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    customer_id bigint,
    site_id bigint,
    unit_id bigint,
    fk_user_id bigint,
    action character varying(120) NOT NULL,
    details text NOT NULL,
    ip_address character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_log OWNER TO postgres;

--
-- Name: audit_log_pk_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_log_pk_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.audit_log_pk_audit_id_seq OWNER TO postgres;

--
-- Name: audit_log_pk_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_log_pk_audit_id_seq OWNED BY public.audit_log.pk_audit_id;


--
-- Name: auth_session_token; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auth_session_token (
    token_id uuid DEFAULT gen_random_uuid() NOT NULL,
    fk_user_id bigint NOT NULL,
    access_token character varying(128) NOT NULL,
    refresh_token character varying(128) NOT NULL,
    access_expires_at timestamp with time zone NOT NULL,
    refresh_expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    user_agent character varying(512),
    ip_address character varying(45),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.auth_session_token OWNER TO postgres;

--
-- Name: device_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.device_events (
    pk_event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    fk_device_id uuid NOT NULL,
    event_type character varying(50) NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    processing_status character varying(20) DEFAULT 'pending'::character varying,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    detected_face_embedding jsonb,
    confidence_score double precision,
    frame_url text,
    processing_attempts integer DEFAULT 0,
    processing_error text,
    CONSTRAINT device_events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['FACE_DETECTED'::character varying, 'MOTION_DETECTED'::character varying, 'EMPLOYEE_ENTRY'::character varying, 'EMPLOYEE_EXIT'::character varying, 'DEVICE_HEARTBEAT'::character varying, 'DEVICE_ERROR'::character varying, 'FRAME_CAPTURED'::character varying])::text[]))),
    CONSTRAINT device_events_processing_status_check CHECK (((processing_status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'ignored'::character varying])::text[])))
);


ALTER TABLE public.device_events OWNER TO postgres;

--
-- Name: devices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.devices (
    pk_device_id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_code character varying(50) NOT NULL,
    device_name character varying(100),
    device_type character varying(20),
    fk_site_id uuid,
    location_description text,
    ip_address inet,
    mac_address character varying(17),
    keycloak_client_id character varying(100),
    api_key_hash character varying(64),
    status character varying(20) DEFAULT 'offline'::character varying,
    config_json jsonb DEFAULT '{}'::jsonb,
    capabilities jsonb DEFAULT '["face_detection"]'::jsonb,
    last_heartbeat_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    firmware_version character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    camera_mode character varying(10) DEFAULT 'MIXED'::character varying,
    CONSTRAINT devices_device_type_check CHECK (((device_type)::text = ANY ((ARRAY['camera'::character varying, 'lpu'::character varying, 'sensor'::character varying, 'gateway'::character varying])::text[]))),
    CONSTRAINT devices_status_check CHECK (((status)::text = ANY ((ARRAY['online'::character varying, 'offline'::character varying, 'error'::character varying, 'maintenance'::character varying])::text[])))
);


ALTER TABLE public.devices OWNER TO postgres;

--
-- Name: employee_face_embeddings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_face_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id bigint NOT NULL,
    embedding public.vector(512) NOT NULL,
    model_version character varying(50) DEFAULT 'arcface-r50-fp16'::character varying,
    quality_score double precision,
    is_primary boolean DEFAULT false,
    enrolled_by bigint,
    enrolled_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.employee_face_embeddings OWNER TO postgres;

--
-- Name: facility_device; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.facility_device (
    pk_device_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    customer_id bigint,
    site_id bigint,
    unit_id bigint,
    external_device_id character varying(80) NOT NULL,
    name character varying(200) NOT NULL,
    location_label character varying(200) NOT NULL,
    ip_address character varying(64) NOT NULL,
    status character varying(20) NOT NULL,
    recognition_accuracy numeric(5,2) DEFAULT 0 NOT NULL,
    total_scans integer DEFAULT 0 NOT NULL,
    error_rate numeric(5,2) DEFAULT 0 NOT NULL,
    model character varying(120),
    last_active timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT facility_device_status_check CHECK (((status)::text = ANY ((ARRAY['online'::character varying, 'offline'::character varying, 'error'::character varying])::text[])))
);


ALTER TABLE public.facility_device OWNER TO postgres;

--
-- Name: facility_device_pk_device_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.facility_device_pk_device_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.facility_device_pk_device_id_seq OWNER TO postgres;

--
-- Name: facility_device_pk_device_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.facility_device_pk_device_id_seq OWNED BY public.facility_device.pk_device_id;


--
-- Name: frs_customer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.frs_customer (
    pk_customer_id bigint NOT NULL,
    customer_name character varying(200) NOT NULL,
    fk_tenant_id bigint NOT NULL
);


ALTER TABLE public.frs_customer OWNER TO postgres;

--
-- Name: frs_customer_pk_customer_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.frs_customer_pk_customer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.frs_customer_pk_customer_id_seq OWNER TO postgres;

--
-- Name: frs_customer_pk_customer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.frs_customer_pk_customer_id_seq OWNED BY public.frs_customer.pk_customer_id;


--
-- Name: frs_customer_user_map; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.frs_customer_user_map (
    fk_user_id bigint NOT NULL,
    fk_customer_id bigint NOT NULL
);


ALTER TABLE public.frs_customer_user_map OWNER TO postgres;

--
-- Name: frs_site; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.frs_site (
    pk_site_id bigint NOT NULL,
    site_name character varying(200) NOT NULL,
    fk_customer_id bigint NOT NULL
);


ALTER TABLE public.frs_site OWNER TO postgres;

--
-- Name: frs_site_pk_site_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.frs_site_pk_site_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.frs_site_pk_site_id_seq OWNER TO postgres;

--
-- Name: frs_site_pk_site_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.frs_site_pk_site_id_seq OWNED BY public.frs_site.pk_site_id;


--
-- Name: frs_tenant; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.frs_tenant (
    pk_tenant_id bigint NOT NULL,
    tenant_name character varying(200) NOT NULL
);


ALTER TABLE public.frs_tenant OWNER TO postgres;

--
-- Name: frs_tenant_pk_tenant_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.frs_tenant_pk_tenant_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.frs_tenant_pk_tenant_id_seq OWNER TO postgres;

--
-- Name: frs_tenant_pk_tenant_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.frs_tenant_pk_tenant_id_seq OWNED BY public.frs_tenant.pk_tenant_id;


--
-- Name: frs_tenant_user_map; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.frs_tenant_user_map (
    fk_user_id bigint NOT NULL,
    fk_tenant_id bigint NOT NULL
);


ALTER TABLE public.frs_tenant_user_map OWNER TO postgres;

--
-- Name: frs_unit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.frs_unit (
    pk_unit_id bigint NOT NULL,
    unit_name character varying(200) NOT NULL,
    fk_site_id bigint NOT NULL
);


ALTER TABLE public.frs_unit OWNER TO postgres;

--
-- Name: frs_unit_pk_unit_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.frs_unit_pk_unit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.frs_unit_pk_unit_id_seq OWNER TO postgres;

--
-- Name: frs_unit_pk_unit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.frs_unit_pk_unit_id_seq OWNED BY public.frs_unit.pk_unit_id;


--
-- Name: frs_user; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.frs_user (
    pk_user_id bigint NOT NULL,
    email character varying(320) NOT NULL,
    username character varying(150) NOT NULL,
    fk_user_type_id integer NOT NULL,
    role character varying(20) NOT NULL,
    password_hash character varying(255),
    department character varying(150),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    keycloak_sub character varying(64),
    auth_provider character varying(20) DEFAULT 'internal'::character varying NOT NULL,
    last_identity_sync_at timestamp with time zone,
    CONSTRAINT frs_user_auth_provider_check CHECK (((auth_provider)::text = ANY ((ARRAY['internal'::character varying, 'keycloak'::character varying, 'federated'::character varying])::text[]))),
    CONSTRAINT frs_user_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'hr'::character varying])::text[])))
);


ALTER TABLE public.frs_user OWNER TO postgres;

--
-- Name: frs_user_membership; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.frs_user_membership (
    pk_membership_id bigint NOT NULL,
    fk_user_id bigint NOT NULL,
    role character varying(20) NOT NULL,
    tenant_id bigint NOT NULL,
    customer_id bigint,
    site_id bigint,
    unit_id bigint,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT frs_user_membership_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'hr'::character varying])::text[])))
);


ALTER TABLE public.frs_user_membership OWNER TO postgres;

--
-- Name: frs_user_membership_pk_membership_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.frs_user_membership_pk_membership_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.frs_user_membership_pk_membership_id_seq OWNER TO postgres;

--
-- Name: frs_user_membership_pk_membership_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.frs_user_membership_pk_membership_id_seq OWNED BY public.frs_user_membership.pk_membership_id;


--
-- Name: frs_user_pk_user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.frs_user_pk_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.frs_user_pk_user_id_seq OWNER TO postgres;

--
-- Name: frs_user_pk_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.frs_user_pk_user_id_seq OWNED BY public.frs_user.pk_user_id;


--
-- Name: hr_department; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hr_department (
    pk_department_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(150) NOT NULL,
    code character varying(30) NOT NULL,
    color character varying(20)
);


ALTER TABLE public.hr_department OWNER TO postgres;

--
-- Name: hr_department_pk_department_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.hr_department_pk_department_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.hr_department_pk_department_id_seq OWNER TO postgres;

--
-- Name: hr_department_pk_department_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.hr_department_pk_department_id_seq OWNED BY public.hr_department.pk_department_id;


--
-- Name: hr_employee; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hr_employee (
    pk_employee_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    customer_id bigint,
    site_id bigint,
    unit_id bigint,
    fk_department_id bigint,
    fk_shift_id bigint,
    employee_code character varying(40) NOT NULL,
    full_name character varying(180) NOT NULL,
    email character varying(320) NOT NULL,
    position_title character varying(180) NOT NULL,
    location_label character varying(180),
    status character varying(20) NOT NULL,
    join_date date NOT NULL,
    phone_number character varying(40),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    face_enrolled boolean DEFAULT false,
    CONSTRAINT hr_employee_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'on-leave'::character varying])::text[])))
);


ALTER TABLE public.hr_employee OWNER TO postgres;

--
-- Name: hr_employee_pk_employee_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.hr_employee_pk_employee_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.hr_employee_pk_employee_id_seq OWNER TO postgres;

--
-- Name: hr_employee_pk_employee_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.hr_employee_pk_employee_id_seq OWNED BY public.hr_employee.pk_employee_id;


--
-- Name: hr_leave_request; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hr_leave_request (
    pk_leave_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    fk_employee_id bigint NOT NULL,
    leave_type character varying(60) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    days integer DEFAULT 1 NOT NULL,
    reason text,
    status character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    approved_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_leave_request_status_check CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Approved'::character varying, 'Rejected'::character varying])::text[])))
);


ALTER TABLE public.hr_leave_request OWNER TO postgres;

--
-- Name: hr_leave_request_pk_leave_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.hr_leave_request_pk_leave_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.hr_leave_request_pk_leave_id_seq OWNER TO postgres;

--
-- Name: hr_leave_request_pk_leave_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.hr_leave_request_pk_leave_id_seq OWNED BY public.hr_leave_request.pk_leave_id;


--
-- Name: hr_shift; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hr_shift (
    pk_shift_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(120) NOT NULL,
    shift_type character varying(30) NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    grace_period_minutes integer DEFAULT 10 NOT NULL,
    is_flexible boolean DEFAULT false NOT NULL,
    CONSTRAINT hr_shift_shift_type_check CHECK (((shift_type)::text = ANY ((ARRAY['morning'::character varying, 'evening'::character varying, 'night'::character varying, 'flexible'::character varying])::text[])))
);


ALTER TABLE public.hr_shift OWNER TO postgres;

--
-- Name: hr_shift_pk_shift_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.hr_shift_pk_shift_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.hr_shift_pk_shift_id_seq OWNER TO postgres;

--
-- Name: hr_shift_pk_shift_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.hr_shift_pk_shift_id_seq OWNED BY public.hr_shift.pk_shift_id;


--
-- Name: system_alert; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_alert (
    pk_alert_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    customer_id bigint,
    site_id bigint,
    unit_id bigint,
    alert_type character varying(80) NOT NULL,
    severity character varying(20) NOT NULL,
    title character varying(220),
    message text NOT NULL,
    fk_employee_id bigint,
    fk_device_id bigint,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_alert_severity_check CHECK (((severity)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[])))
);


ALTER TABLE public.system_alert OWNER TO postgres;

--
-- Name: system_alert_pk_alert_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.system_alert_pk_alert_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.system_alert_pk_alert_id_seq OWNER TO postgres;

--
-- Name: system_alert_pk_alert_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.system_alert_pk_alert_id_seq OWNED BY public.system_alert.pk_alert_id;


--
-- Name: attendance_events pk_attendance_event_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_events ALTER COLUMN pk_attendance_event_id SET DEFAULT nextval('public.attendance_events_pk_attendance_event_id_seq'::regclass);


--
-- Name: attendance_record pk_attendance_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_record ALTER COLUMN pk_attendance_id SET DEFAULT nextval('public.attendance_record_pk_attendance_id_seq'::regclass);


--
-- Name: audit_log pk_audit_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN pk_audit_id SET DEFAULT nextval('public.audit_log_pk_audit_id_seq'::regclass);


--
-- Name: facility_device pk_device_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_device ALTER COLUMN pk_device_id SET DEFAULT nextval('public.facility_device_pk_device_id_seq'::regclass);


--
-- Name: frs_customer pk_customer_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_customer ALTER COLUMN pk_customer_id SET DEFAULT nextval('public.frs_customer_pk_customer_id_seq'::regclass);


--
-- Name: frs_site pk_site_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_site ALTER COLUMN pk_site_id SET DEFAULT nextval('public.frs_site_pk_site_id_seq'::regclass);


--
-- Name: frs_tenant pk_tenant_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_tenant ALTER COLUMN pk_tenant_id SET DEFAULT nextval('public.frs_tenant_pk_tenant_id_seq'::regclass);


--
-- Name: frs_unit pk_unit_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_unit ALTER COLUMN pk_unit_id SET DEFAULT nextval('public.frs_unit_pk_unit_id_seq'::regclass);


--
-- Name: frs_user pk_user_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user ALTER COLUMN pk_user_id SET DEFAULT nextval('public.frs_user_pk_user_id_seq'::regclass);


--
-- Name: frs_user_membership pk_membership_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user_membership ALTER COLUMN pk_membership_id SET DEFAULT nextval('public.frs_user_membership_pk_membership_id_seq'::regclass);


--
-- Name: hr_department pk_department_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_department ALTER COLUMN pk_department_id SET DEFAULT nextval('public.hr_department_pk_department_id_seq'::regclass);


--
-- Name: hr_employee pk_employee_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_employee ALTER COLUMN pk_employee_id SET DEFAULT nextval('public.hr_employee_pk_employee_id_seq'::regclass);


--
-- Name: hr_leave_request pk_leave_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_leave_request ALTER COLUMN pk_leave_id SET DEFAULT nextval('public.hr_leave_request_pk_leave_id_seq'::regclass);


--
-- Name: hr_shift pk_shift_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_shift ALTER COLUMN pk_shift_id SET DEFAULT nextval('public.hr_shift_pk_shift_id_seq'::regclass);


--
-- Name: system_alert pk_alert_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_alert ALTER COLUMN pk_alert_id SET DEFAULT nextval('public.system_alert_pk_alert_id_seq'::regclass);


--
-- Data for Name: attendance_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance_events (pk_attendance_event_id, fk_employee_id, fk_device_id, fk_original_event_id, event_type, occurred_at, confidence_score, verification_method, recognition_model_version, frame_image_url, face_bounding_box, location_zone, entry_exit_direction, fk_shift_id, is_expected_entry, is_on_time, created_at) FROM stdin;
\.


--
-- Data for Name: attendance_record; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance_record (pk_attendance_id, tenant_id, customer_id, site_id, unit_id, fk_employee_id, attendance_date, check_in, check_out, break_start, break_end, status, working_hours, break_duration_minutes, overtime_hours, is_late, is_early_departure, device_id, location_label, recognition_accuracy, created_at, frame_url, recognition_confidence, duration_minutes, checkin_frame_url, checkout_frame_url) FROM stdin;
1650	1	1	1	\N	47	2026-03-24	2026-03-24 05:50:30.195+00	2026-03-24 06:00:06.37+00	\N	\N	present	0.00	0	0.00	f	f	\N	\N	\N	2026-03-24 05:50:30.206601+00	/api/attendance/photos/47_2026-03-24T05-50-30.jpg	0.7409262657165527	10	\N	/api/attendance/photos/47_2026-03-24T06-00-06.jpg
1658	1	1	1	\N	46	2026-03-24	2026-03-24 05:52:43.526+00	2026-03-24 05:55:21.076+00	\N	\N	present	0.00	0	0.00	f	f	\N	\N	\N	2026-03-24 05:52:43.541955+00	/api/attendance/photos/46_2026-03-24T05-52-43.jpg	0.6197013854980469	3	/api/attendance/photos/46_2026-03-24T05-52-43.jpg	/api/attendance/photos/46_2026-03-24T05-55-21.jpg
1651	1	1	1	\N	44	2026-03-24	2026-03-24 05:50:40.59+00	2026-03-24 05:50:45.117+00	\N	\N	present	0.00	0	0.00	f	f	\N	\N	\N	2026-03-24 05:50:40.604245+00	/api/attendance/photos/44_2026-03-24T05-50-40.jpg	0.6370307803153992	0	/api/attendance/photos/44_2026-03-24T05-50-40.jpg	\N
1666	1	1	1	\N	2	2026-03-24	2026-03-24 05:58:12.363+00	2026-03-24 06:03:55.872+00	\N	\N	present	0.00	0	0.00	f	f	\N	\N	\N	2026-03-24 05:58:12.395024+00	/api/attendance/photos/2_2026-03-24T05-58-12.jpg	0.8322356343269348	6	/api/attendance/photos/2_2026-03-24T05-58-12.jpg	/api/attendance/photos/2_2026-03-24T06-03-55.jpg
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_log (pk_audit_id, tenant_id, customer_id, site_id, unit_id, fk_user_id, action, details, ip_address, created_at) FROM stdin;
1	1	1	1	1	1	User Created	Created new HR user: hr@company.com	192.168.1.50	2026-03-19 10:48:35.694809+00
2	1	1	1	1	1	Device Registered	Registered device: Main Entrance - Building A	192.168.1.50	2026-03-19 10:48:35.694809+00
3	1	1	1	1	2	Report Exported	Exported attendance report for January 2026	192.168.1.75	2026-03-19 10:48:35.694809+00
22	1	\N	\N	\N	1	face.enroll.delete	Face enrollment removed for employee 44 (9 embedding(s) deleted)	::ffff:192.168.2.1	2026-03-23 05:37:53.674425+00
23	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.557)	::ffff:192.168.2.1	2026-03-23 05:47:23.037468+00
24	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.583)	::ffff:192.168.2.1	2026-03-23 05:57:06.389486+00
25	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 06:05:38.371254+00
26	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.559)	::ffff:192.168.2.1	2026-03-23 06:17:43.719568+00
27	1	\N	\N	\N	1	face.enroll.delete	Face enrollment removed for employee 46 (1 embedding(s) deleted)	::ffff:192.168.2.1	2026-03-23 06:20:18.015493+00
28	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.786)	::ffff:192.168.2.1	2026-03-23 06:20:53.763176+00
29	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.554)	::ffff:192.168.2.1	2026-03-23 06:23:13.088488+00
30	1	1	1	\N	2	dept.assign	Department 2 assigned to 1 employee(s): [47]	::ffff:192.168.2.1	2026-03-23 06:36:06.571067+00
31	1	1	1	\N	2	dept.assign	Department 1 assigned to 1 employee(s): [46]	::ffff:192.168.2.1	2026-03-23 06:36:12.523279+00
32	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 06:46:43.118534+00
33	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.552)	::ffff:192.168.2.1	2026-03-23 06:58:28.983204+00
34	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.560)	::ffff:192.168.2.1	2026-03-23 06:58:30.508013+00
35	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.565)	::ffff:192.168.2.1	2026-03-23 06:58:31.97702+00
36	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.559)	::ffff:192.168.2.1	2026-03-23 06:58:36.484091+00
37	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 06:58:38.003352+00
38	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 06:58:39.522015+00
39	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.687)	::ffff:192.168.2.1	2026-03-23 06:58:40.977323+00
40	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.589)	::ffff:192.168.2.1	2026-03-23 06:58:41.012425+00
41	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.637)	::ffff:192.168.2.1	2026-03-23 06:58:42.521256+00
42	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.640)	::ffff:192.168.2.1	2026-03-23 06:58:44.000705+00
43	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.630)	::ffff:192.168.2.1	2026-03-23 07:19:02.113739+00
44	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.569)	::ffff:192.168.2.1	2026-03-23 07:19:03.615334+00
45	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 07:19:05.11213+00
46	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-23 07:20:33.832683+00
47	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.654)	::ffff:192.168.2.1	2026-03-23 07:20:36.630298+00
48	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 07:22:05.133257+00
49	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.615)	::ffff:192.168.2.1	2026-03-23 07:22:08.131769+00
50	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 07:22:12.657579+00
51	1	1	1	\N	2	shift.assign	Shift 2 assigned to 2 employee(s): [46,47]	::ffff:192.168.2.1	2026-03-23 07:45:51.530607+00
52	1	1	1	\N	2	shift.assign	Shift 1 assigned to 1 employee(s): [46]	::ffff:192.168.2.1	2026-03-23 07:45:58.60683+00
53	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.695)	::ffff:192.168.2.1	2026-03-23 08:24:22.041011+00
54	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.575)	::ffff:192.168.2.1	2026-03-23 08:24:23.492847+00
55	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.646)	::ffff:192.168.2.1	2026-03-23 08:24:23.511639+00
56	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.561)	::ffff:192.168.2.1	2026-03-23 08:24:25.016953+00
57	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.644)	::ffff:192.168.2.1	2026-03-23 08:24:26.494586+00
58	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 08:24:31.017669+00
59	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.754)	::ffff:192.168.2.1	2026-03-23 08:24:31.06531+00
60	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.727)	::ffff:192.168.2.1	2026-03-23 08:24:32.541551+00
61	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 08:24:34.012667+00
62	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.719)	::ffff:192.168.2.1	2026-03-23 08:24:34.059477+00
63	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.581)	::ffff:192.168.2.1	2026-03-23 08:24:35.49377+00
64	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.578)	::ffff:192.168.2.1	2026-03-23 08:24:35.519091+00
65	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 08:24:37.014311+00
66	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.662)	::ffff:192.168.2.1	2026-03-23 08:28:46.062261+00
67	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.639)	::ffff:192.168.2.1	2026-03-23 08:28:47.569893+00
68	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.644)	::ffff:192.168.2.1	2026-03-23 08:28:49.089877+00
69	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.607)	::ffff:192.168.2.1	2026-03-23 08:28:50.54131+00
70	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.600)	::ffff:192.168.2.1	2026-03-23 08:28:52.066033+00
71	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.674)	::ffff:192.168.2.1	2026-03-23 08:28:53.566531+00
72	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.659)	::ffff:192.168.2.1	2026-03-23 08:28:55.087244+00
73	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.610)	::ffff:192.168.2.1	2026-03-23 08:28:56.544072+00
74	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.627)	::ffff:192.168.2.1	2026-03-23 08:28:58.062224+00
75	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.632)	::ffff:192.168.2.1	2026-03-23 08:28:59.543828+00
76	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.557)	::ffff:192.168.2.1	2026-03-23 08:29:20.542566+00
77	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.553)	::ffff:192.168.2.1	2026-03-23 08:57:56.711048+00
78	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.584)	::ffff:192.168.2.1	2026-03-23 08:58:14.704274+00
79	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 08:58:23.723591+00
80	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 08:58:25.223818+00
81	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 08:58:26.723297+00
82	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 08:58:28.225811+00
83	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.596)	::ffff:192.168.2.1	2026-03-23 08:58:29.724384+00
84	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 08:58:31.223425+00
85	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.590)	::ffff:192.168.2.1	2026-03-23 08:58:35.725028+00
86	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.646)	::ffff:192.168.2.1	2026-03-23 09:02:40.306684+00
87	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 09:55:20.585087+00
88	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.605)	::ffff:192.168.2.1	2026-03-23 09:55:23.583275+00
89	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 09:55:32.560833+00
90	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.579)	::ffff:192.168.2.1	2026-03-23 09:55:34.171784+00
91	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 10:02:26.5124+00
92	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.565)	::ffff:192.168.2.1	2026-03-23 10:02:29.504713+00
93	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 10:02:56.5266+00
94	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.636)	::ffff:192.168.2.1	2026-03-23 10:21:43.054769+00
95	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 10:21:44.573767+00
96	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.653)	::ffff:192.168.2.1	2026-03-23 10:21:44.617151+00
97	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.676)	::ffff:192.168.2.1	2026-03-23 10:21:46.055649+00
98	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 10:21:49.031326+00
99	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.550)	::ffff:192.168.2.1	2026-03-23 10:24:14.57325+00
100	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.567)	::ffff:192.168.2.1	2026-03-23 10:24:16.031988+00
101	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.556)	::ffff:192.168.2.1	2026-03-23 10:36:08.923754+00
102	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.558)	::ffff:192.168.2.1	2026-03-23 10:36:10.467955+00
103	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.583)	::ffff:192.168.2.1	2026-03-23 10:36:11.945099+00
104	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-23 10:41:49.522274+00
105	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.552)	::ffff:192.168.2.1	2026-03-23 10:45:53.979775+00
106	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 10:45:55.544643+00
107	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 10:45:56.979714+00
108	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.586)	::ffff:192.168.2.1	2026-03-23 10:46:03.00033+00
109	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.602)	::ffff:192.168.2.1	2026-03-23 10:46:04.51863+00
110	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.597)	::ffff:192.168.2.1	2026-03-23 10:46:05.979781+00
111	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.578)	::ffff:192.168.2.1	2026-03-23 10:46:07.518634+00
112	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.581)	::ffff:192.168.2.1	2026-03-23 10:46:08.979295+00
113	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.589)	::ffff:192.168.2.1	2026-03-23 10:46:10.521507+00
114	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.556)	::ffff:192.168.2.1	2026-03-23 10:46:11.979846+00
115	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.578)	::ffff:192.168.2.1	2026-03-23 10:46:13.5385+00
116	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-23 10:46:14.979966+00
117	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-23 10:46:16.540772+00
118	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.614)	::ffff:192.168.2.1	2026-03-23 10:46:18.001267+00
119	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 10:47:42.04073+00
120	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.576)	::ffff:192.168.2.1	2026-03-23 10:48:29.996492+00
121	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 10:50:11.809905+00
122	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.584)	::ffff:192.168.2.1	2026-03-23 10:51:49.334133+00
123	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 10:51:50.851462+00
124	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-23 10:51:52.349563+00
125	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.578)	::ffff:192.168.2.1	2026-03-23 10:54:10.382958+00
126	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.562)	::ffff:192.168.2.1	2026-03-23 10:55:20.845323+00
127	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.574)	::ffff:192.168.2.1	2026-03-23 10:55:23.866546+00
128	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.554)	::ffff:192.168.2.1	2026-03-23 10:55:43.390763+00
129	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 10:57:47.890096+00
130	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.586)	::ffff:192.168.2.1	2026-03-23 10:58:10.407394+00
131	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.665)	::ffff:192.168.2.1	2026-03-23 11:12:18.475039+00
132	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.675)	::ffff:192.168.2.1	2026-03-23 11:12:19.96501+00
133	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.622)	::ffff:192.168.2.1	2026-03-23 11:12:21.46796+00
134	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.559)	::ffff:192.168.2.1	2026-03-23 11:12:25.968597+00
135	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.623)	::ffff:192.168.2.1	2026-03-23 11:12:27.463914+00
136	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 11:12:28.968127+00
137	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.589)	::ffff:192.168.2.1	2026-03-23 11:12:30.463839+00
138	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 11:12:31.966941+00
139	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.567)	::ffff:192.168.2.1	2026-03-23 11:12:33.482701+00
140	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.622)	::ffff:192.168.2.1	2026-03-23 11:12:34.964873+00
141	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 11:12:37.968137+00
142	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.550)	::ffff:192.168.2.1	2026-03-23 11:12:39.462573+00
143	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.637)	::ffff:192.168.2.1	2026-03-23 11:12:40.966905+00
144	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.613)	::ffff:192.168.2.1	2026-03-23 11:12:42.463285+00
145	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.635)	::ffff:192.168.2.1	2026-03-23 11:12:51.462682+00
146	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.562)	::ffff:192.168.2.1	2026-03-23 11:13:09.465336+00
147	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 11:13:33.464011+00
148	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.570)	::ffff:192.168.2.1	2026-03-23 11:13:36.465154+00
149	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.559)	::ffff:192.168.2.1	2026-03-23 11:13:46.965369+00
150	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.611)	::ffff:192.168.2.1	2026-03-23 11:13:48.464721+00
151	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 11:13:49.966477+00
152	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 11:13:51.460134+00
153	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 11:13:58.984903+00
154	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.646)	::ffff:192.168.2.1	2026-03-23 11:14:01.961876+00
155	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 11:14:06.501024+00
156	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.567)	::ffff:192.168.2.1	2026-03-23 11:14:07.962827+00
157	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.655)	::ffff:192.168.2.1	2026-03-23 11:14:09.505354+00
158	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.618)	::ffff:192.168.2.1	2026-03-23 11:14:10.964412+00
159	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.623)	::ffff:192.168.2.1	2026-03-23 11:14:12.488276+00
160	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.646)	::ffff:192.168.2.1	2026-03-23 11:14:13.964483+00
161	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.603)	::ffff:192.168.2.1	2026-03-23 11:14:15.485479+00
162	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.660)	::ffff:192.168.2.1	2026-03-23 11:14:16.963915+00
163	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.552)	::ffff:192.168.2.1	2026-03-23 11:14:19.964459+00
164	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.657)	::ffff:192.168.2.1	2026-03-23 11:14:24.487387+00
165	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.635)	::ffff:192.168.2.1	2026-03-23 11:14:28.961793+00
166	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.670)	::ffff:192.168.2.1	2026-03-23 11:14:30.482731+00
167	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.594)	::ffff:192.168.2.1	2026-03-23 11:14:31.963308+00
168	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 11:14:33.483618+00
169	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.678)	::ffff:192.168.2.1	2026-03-23 11:14:41.035865+00
170	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.628)	::ffff:192.168.2.1	2026-03-23 11:14:42.492893+00
171	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.639)	::ffff:192.168.2.1	2026-03-23 11:14:43.966849+00
172	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.596)	::ffff:192.168.2.1	2026-03-23 11:14:45.486426+00
173	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.619)	::ffff:192.168.2.1	2026-03-23 11:14:46.963553+00
174	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.587)	::ffff:192.168.2.1	2026-03-23 11:14:48.485799+00
175	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.602)	::ffff:192.168.2.1	2026-03-23 11:14:49.970267+00
176	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.579)	::ffff:192.168.2.1	2026-03-23 11:14:51.485338+00
177	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.561)	::ffff:192.168.2.1	2026-03-23 11:14:58.962875+00
178	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 11:15:16.98448+00
179	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 11:15:22.984781+00
180	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 11:15:27.507276+00
181	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.622)	::ffff:192.168.2.1	2026-03-23 11:15:28.963961+00
182	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.559)	::ffff:192.168.2.1	2026-03-23 11:15:33.471974+00
183	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.562)	::ffff:192.168.2.1	2026-03-23 11:15:37.96288+00
184	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 11:15:39.501416+00
185	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.616)	::ffff:192.168.2.1	2026-03-23 11:15:42.505959+00
186	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.613)	::ffff:192.168.2.1	2026-03-23 11:15:43.9651+00
187	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.575)	::ffff:192.168.2.1	2026-03-23 11:15:45.529299+00
188	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.567)	::ffff:192.168.2.1	2026-03-23 11:15:46.986056+00
189	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.606)	::ffff:192.168.2.1	2026-03-23 11:15:48.527797+00
190	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.600)	::ffff:192.168.2.1	2026-03-23 11:15:49.98424+00
191	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.608)	::ffff:192.168.2.1	2026-03-23 11:15:51.527097+00
192	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.664)	::ffff:192.168.2.1	2026-03-23 11:15:52.963115+00
193	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.719)	::ffff:192.168.2.1	2026-03-23 11:15:54.510559+00
194	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.570)	::ffff:192.168.2.1	2026-03-23 11:16:01.96773+00
195	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.585)	::ffff:192.168.2.1	2026-03-23 11:16:03.507764+00
196	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.623)	::ffff:192.168.2.1	2026-03-23 11:16:04.963696+00
197	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.722)	::ffff:192.168.2.1	2026-03-23 11:16:06.507374+00
198	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.736)	::ffff:192.168.2.1	2026-03-23 11:16:19.968312+00
199	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.672)	::ffff:192.168.2.1	2026-03-23 11:16:21.504402+00
200	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.554)	::ffff:192.168.2.1	2026-03-23 11:16:24.503644+00
201	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.585)	::ffff:192.168.2.1	2026-03-23 11:16:25.986394+00
202	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.605)	::ffff:192.168.2.1	2026-03-23 11:16:27.537624+00
203	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.640)	::ffff:192.168.2.1	2026-03-23 11:16:29.007473+00
204	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.676)	::ffff:192.168.2.1	2026-03-23 11:16:30.547542+00
205	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-23 11:16:36.547908+00
206	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-23 11:16:37.963894+00
207	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.571)	::ffff:192.168.2.1	2026-03-23 11:16:39.503526+00
208	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.605)	::ffff:192.168.2.1	2026-03-23 11:16:40.965945+00
209	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.597)	::ffff:192.168.2.1	2026-03-23 11:16:43.965265+00
210	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.570)	::ffff:192.168.2.1	2026-03-23 11:16:45.506812+00
211	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.649)	::ffff:192.168.2.1	2026-03-23 11:16:46.965114+00
212	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.656)	::ffff:192.168.2.1	2026-03-23 11:16:48.506457+00
213	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.627)	::ffff:192.168.2.1	2026-03-23 11:16:49.966433+00
214	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.582)	::ffff:192.168.2.1	2026-03-23 11:16:51.503924+00
215	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.598)	::ffff:192.168.2.1	2026-03-23 11:16:52.96222+00
216	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.616)	::ffff:192.168.2.1	2026-03-23 11:16:54.503992+00
217	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.596)	::ffff:192.168.2.1	2026-03-23 11:16:55.964069+00
218	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.652)	::ffff:192.168.2.1	2026-03-23 11:16:57.503521+00
219	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.553)	::ffff:192.168.2.1	2026-03-23 11:17:12.524963+00
220	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.575)	::ffff:192.168.2.1	2026-03-23 11:17:13.983399+00
221	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.635)	::ffff:192.168.2.1	2026-03-23 11:17:25.983778+00
222	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 11:17:27.519809+00
223	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.662)	::ffff:192.168.2.1	2026-03-23 11:17:33.544037+00
224	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.600)	::ffff:192.168.2.1	2026-03-23 11:17:34.983557+00
225	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.562)	::ffff:192.168.2.1	2026-03-23 11:17:38.002077+00
226	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.585)	::ffff:192.168.2.1	2026-03-23 11:17:42.522764+00
227	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.603)	::ffff:192.168.2.1	2026-03-23 11:17:47.002649+00
228	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.595)	::ffff:192.168.2.1	2026-03-23 11:17:57.504018+00
229	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.634)	::ffff:192.168.2.1	2026-03-23 11:17:59.001326+00
230	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.685)	::ffff:192.168.2.1	2026-03-23 11:18:02.003138+00
231	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.607)	::ffff:192.168.2.1	2026-03-23 11:18:06.524799+00
232	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 11:18:29.002825+00
233	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.677)	::ffff:192.168.2.1	2026-03-23 11:18:30.521536+00
234	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.696)	::ffff:192.168.2.1	2026-03-23 11:18:33.502107+00
235	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.574)	::ffff:192.168.2.1	2026-03-23 11:18:35.006427+00
236	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.680)	::ffff:192.168.2.1	2026-03-23 11:18:36.525776+00
237	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.711)	::ffff:192.168.2.1	2026-03-23 11:18:38.006599+00
238	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.732)	::ffff:192.168.2.1	2026-03-23 11:18:39.545656+00
239	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.639)	::ffff:192.168.2.1	2026-03-23 11:18:41.003085+00
240	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.632)	::ffff:192.168.2.1	2026-03-23 11:18:42.530183+00
241	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.617)	::ffff:192.168.2.1	2026-03-23 11:18:43.998444+00
242	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.572)	::ffff:192.168.2.1	2026-03-23 11:18:45.526462+00
243	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.659)	::ffff:192.168.2.1	2026-03-23 11:18:46.98515+00
244	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.620)	::ffff:192.168.2.1	2026-03-23 11:18:48.548117+00
245	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.596)	::ffff:192.168.2.1	2026-03-23 11:18:56.00784+00
246	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.637)	::ffff:192.168.2.1	2026-03-23 11:18:57.503326+00
247	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 11:18:59.004417+00
248	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 11:19:02.012574+00
249	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.561)	::ffff:192.168.2.1	2026-03-23 11:19:08.025447+00
250	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 11:19:09.555674+00
251	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.655)	::ffff:192.168.2.1	2026-03-23 11:19:11.028021+00
252	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.591)	::ffff:192.168.2.1	2026-03-23 11:19:12.569111+00
253	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.629)	::ffff:192.168.2.1	2026-03-23 11:19:18.550711+00
254	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.621)	::ffff:192.168.2.1	2026-03-23 11:19:19.98364+00
255	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.617)	::ffff:192.168.2.1	2026-03-23 11:19:21.52648+00
256	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.610)	::ffff:192.168.2.1	2026-03-23 11:19:23.006967+00
257	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.597)	::ffff:192.168.2.1	2026-03-23 11:19:25.984421+00
258	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.584)	::ffff:192.168.2.1	2026-03-23 11:19:38.008378+00
259	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.585)	::ffff:192.168.2.1	2026-03-23 11:19:40.984306+00
260	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.554)	::ffff:192.168.2.1	2026-03-23 11:19:42.545132+00
261	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.560)	::ffff:192.168.2.1	2026-03-23 11:19:45.548369+00
262	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.598)	::ffff:192.168.2.1	2026-03-23 11:19:47.006846+00
263	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.635)	::ffff:192.168.2.1	2026-03-23 11:19:48.546635+00
264	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 11:19:55.984489+00
265	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 11:19:57.529689+00
266	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.584)	::ffff:192.168.2.1	2026-03-23 11:19:58.985453+00
267	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.659)	::ffff:192.168.2.1	2026-03-23 11:20:00.522369+00
268	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.640)	::ffff:192.168.2.1	2026-03-23 11:20:01.984446+00
269	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.628)	::ffff:192.168.2.1	2026-03-23 11:20:03.528572+00
270	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.667)	::ffff:192.168.2.1	2026-03-23 11:20:04.985655+00
271	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.641)	::ffff:192.168.2.1	2026-03-23 11:20:06.525701+00
272	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.708)	::ffff:192.168.2.1	2026-03-23 11:20:07.98618+00
273	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.643)	::ffff:192.168.2.1	2026-03-23 11:20:09.525215+00
274	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-23 11:20:10.982877+00
275	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.616)	::ffff:192.168.2.1	2026-03-23 11:20:12.551397+00
276	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.623)	::ffff:192.168.2.1	2026-03-23 11:20:13.98747+00
277	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.583)	::ffff:192.168.2.1	2026-03-23 11:20:15.532559+00
278	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.615)	::ffff:192.168.2.1	2026-03-23 11:20:16.984162+00
279	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.616)	::ffff:192.168.2.1	2026-03-23 11:20:18.527906+00
280	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 11:20:19.984669+00
281	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.668)	::ffff:192.168.2.1	2026-03-23 11:20:21.54363+00
282	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 11:20:30.525264+00
283	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.583)	::ffff:192.168.2.1	2026-03-23 11:20:41.00548+00
284	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.581)	::ffff:192.168.2.1	2026-03-23 11:20:42.541192+00
285	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.596)	::ffff:192.168.2.1	2026-03-23 11:20:49.98545+00
286	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.550)	::ffff:192.168.2.1	2026-03-23 11:20:53.004892+00
287	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 11:21:05.023219+00
288	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 11:21:17.004428+00
289	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.558)	::ffff:192.168.2.1	2026-03-23 11:21:27.544731+00
290	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.625)	::ffff:192.168.2.1	2026-03-23 11:21:33.548955+00
291	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 11:21:38.024692+00
292	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.666)	::ffff:192.168.2.1	2026-03-23 11:21:41.027202+00
293	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.571)	::ffff:192.168.2.1	2026-03-23 11:21:42.524452+00
294	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.552)	::ffff:192.168.2.1	2026-03-23 11:21:45.523294+00
295	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.553)	::ffff:192.168.2.1	2026-03-23 11:21:46.999889+00
296	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.686)	::ffff:192.168.2.1	2026-03-23 11:21:47.023616+00
297	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.628)	::ffff:192.168.2.1	2026-03-23 11:21:50.024053+00
298	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 11:21:53.025196+00
299	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.621)	::ffff:192.168.2.1	2026-03-23 11:21:57.54525+00
300	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.728)	::ffff:192.168.2.1	2026-03-23 11:21:59.0029+00
301	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.567)	::ffff:192.168.2.1	2026-03-23 11:22:06.522999+00
302	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 11:22:08.000966+00
303	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.689)	::ffff:192.168.2.1	2026-03-23 11:22:09.525196+00
304	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.570)	::ffff:192.168.2.1	2026-03-23 11:22:12.506596+00
305	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.637)	::ffff:192.168.2.1	2026-03-23 11:22:15.504195+00
306	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.581)	::ffff:192.168.2.1	2026-03-23 11:22:17.005879+00
307	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.589)	::ffff:192.168.2.1	2026-03-23 11:22:20.007034+00
308	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.644)	::ffff:192.168.2.1	2026-03-23 11:22:21.525286+00
309	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.676)	::ffff:192.168.2.1	2026-03-23 11:22:26.004373+00
310	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.636)	::ffff:192.168.2.1	2026-03-23 11:22:29.017257+00
311	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.557)	::ffff:192.168.2.1	2026-03-23 11:22:30.523005+00
312	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.551)	::ffff:192.168.2.1	2026-03-23 11:22:32.003228+00
313	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.562)	::ffff:192.168.2.1	2026-03-23 11:22:33.524647+00
314	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.652)	::ffff:192.168.2.1	2026-03-23 11:22:39.523188+00
315	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.600)	::ffff:192.168.2.1	2026-03-23 11:22:42.524776+00
316	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-23 11:22:44.02559+00
317	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.634)	::ffff:192.168.2.1	2026-03-23 11:22:45.541713+00
318	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.711)	::ffff:192.168.2.1	2026-03-23 11:22:47.02523+00
319	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.635)	::ffff:192.168.2.1	2026-03-23 11:22:48.524602+00
320	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.602)	::ffff:192.168.2.1	2026-03-23 11:22:50.026117+00
321	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.654)	::ffff:192.168.2.1	2026-03-23 11:22:51.574291+00
322	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.677)	::ffff:192.168.2.1	2026-03-23 11:22:53.024559+00
323	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.622)	::ffff:192.168.2.1	2026-03-23 11:22:56.002909+00
324	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.576)	::ffff:192.168.2.1	2026-03-23 11:22:57.547084+00
325	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.566)	::ffff:192.168.2.1	2026-03-23 11:23:00.549298+00
326	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.624)	::ffff:192.168.2.1	2026-03-23 11:23:02.022445+00
327	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.551)	::ffff:192.168.2.1	2026-03-23 11:23:05.023083+00
328	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.715)	::ffff:192.168.2.1	2026-03-23 11:23:08.025613+00
329	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.766)	::ffff:192.168.2.1	2026-03-23 11:23:09.545095+00
330	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 11:23:11.024777+00
331	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.676)	::ffff:192.168.2.1	2026-03-23 11:23:12.543214+00
332	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.640)	::ffff:192.168.2.1	2026-03-23 11:23:14.004619+00
333	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.731)	::ffff:192.168.2.1	2026-03-23 11:23:15.565493+00
334	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.715)	::ffff:192.168.2.1	2026-03-23 11:23:17.026909+00
335	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.640)	::ffff:192.168.2.1	2026-03-23 11:23:18.566903+00
336	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.581)	::ffff:192.168.2.1	2026-03-23 11:23:20.026141+00
337	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 11:23:21.564598+00
338	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 11:23:23.017353+00
339	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 11:23:24.568098+00
340	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.616)	::ffff:192.168.2.1	2026-03-23 11:23:30.545921+00
341	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 11:23:32.02579+00
342	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.709)	::ffff:192.168.2.1	2026-03-23 11:23:33.541901+00
343	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 11:24:02.027344+00
344	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.565)	::ffff:192.168.2.1	2026-03-23 11:24:09.587814+00
345	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.561)	::ffff:192.168.2.1	2026-03-23 11:24:11.049682+00
346	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.568)	::ffff:192.168.2.1	2026-03-23 11:24:12.701557+00
347	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.742)	::ffff:192.168.2.1	2026-03-23 11:24:14.017362+00
348	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.627)	::ffff:192.168.2.1	2026-03-23 11:24:15.565376+00
349	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.575)	::ffff:192.168.2.1	2026-03-23 11:24:18.563568+00
350	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 11:24:20.023108+00
351	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.641)	::ffff:192.168.2.1	2026-03-23 11:24:21.545076+00
352	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.635)	::ffff:192.168.2.1	2026-03-23 11:24:24.547789+00
353	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 11:24:30.54728+00
354	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.630)	::ffff:192.168.2.1	2026-03-23 11:24:36.542992+00
355	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.586)	::ffff:192.168.2.1	2026-03-23 11:24:38.00072+00
356	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.634)	::ffff:192.168.2.1	2026-03-23 11:24:39.564788+00
357	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.657)	::ffff:192.168.2.1	2026-03-23 11:24:41.025413+00
358	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.740)	::ffff:192.168.2.1	2026-03-23 11:24:42.562228+00
359	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.692)	::ffff:192.168.2.1	2026-03-23 11:24:48.64693+00
360	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-23 11:24:50.007196+00
361	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.660)	::ffff:192.168.2.1	2026-03-23 11:24:51.544558+00
362	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.666)	::ffff:192.168.2.1	2026-03-23 11:24:53.030628+00
363	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.691)	::ffff:192.168.2.1	2026-03-23 11:24:54.569005+00
364	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.653)	::ffff:192.168.2.1	2026-03-23 11:24:56.029352+00
365	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.678)	::ffff:192.168.2.1	2026-03-23 11:24:57.56843+00
366	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.645)	::ffff:192.168.2.1	2026-03-23 11:24:59.006939+00
367	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.614)	::ffff:192.168.2.1	2026-03-23 11:25:00.546622+00
368	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.627)	::ffff:192.168.2.1	2026-03-23 11:25:36.567812+00
369	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.584)	::ffff:192.168.2.1	2026-03-23 11:25:39.558194+00
370	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.558)	::ffff:192.168.2.1	2026-03-23 11:25:41.026779+00
371	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.550)	::ffff:192.168.2.1	2026-03-23 11:25:48.568573+00
372	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.550)	::ffff:192.168.2.1	2026-03-23 11:25:57.549777+00
373	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.589)	::ffff:192.168.2.1	2026-03-23 11:26:00.545068+00
374	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 11:26:11.023439+00
375	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.609)	::ffff:192.168.2.1	2026-03-23 11:26:12.543361+00
376	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 11:26:14.021742+00
377	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.576)	::ffff:192.168.2.1	2026-03-23 11:26:17.024998+00
378	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.625)	::ffff:192.168.2.1	2026-03-23 11:26:24.546845+00
379	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.627)	::ffff:192.168.2.1	2026-03-23 11:26:26.021858+00
380	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.570)	::ffff:192.168.2.1	2026-03-23 11:26:38.025039+00
381	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.619)	::ffff:192.168.2.1	2026-03-23 11:26:39.544829+00
382	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.553)	::ffff:192.168.2.1	2026-03-23 11:26:41.056411+00
383	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.557)	::ffff:192.168.2.1	2026-03-23 11:26:45.546042+00
384	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.584)	::ffff:192.168.2.1	2026-03-23 11:26:48.545098+00
385	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.674)	::ffff:192.168.2.1	2026-03-23 11:26:51.567814+00
386	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 11:27:02.044491+00
387	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.585)	::ffff:192.168.2.1	2026-03-23 11:27:03.543993+00
388	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.728)	::ffff:192.168.2.1	2026-03-23 11:27:05.024772+00
389	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.639)	::ffff:192.168.2.1	2026-03-23 11:27:06.546963+00
390	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.654)	::ffff:192.168.2.1	2026-03-23 11:27:08.049092+00
391	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.719)	::ffff:192.168.2.1	2026-03-23 11:27:09.5684+00
392	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.675)	::ffff:192.168.2.1	2026-03-23 11:27:11.046817+00
393	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.614)	::ffff:192.168.2.1	2026-03-23 11:27:21.565788+00
394	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.682)	::ffff:192.168.2.1	2026-03-23 11:27:23.046209+00
395	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.688)	::ffff:192.168.2.1	2026-03-23 11:27:24.567705+00
396	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.587)	::ffff:192.168.2.1	2026-03-23 11:27:26.048075+00
397	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.551)	::ffff:192.168.2.1	2026-03-23 11:27:27.568415+00
398	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.570)	::ffff:192.168.2.1	2026-03-23 11:27:32.050083+00
399	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.557)	::ffff:192.168.2.1	2026-03-23 11:27:35.07194+00
400	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.556)	::ffff:192.168.2.1	2026-03-23 11:27:41.068112+00
401	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.609)	::ffff:192.168.2.1	2026-03-23 11:28:18.584987+00
402	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.579)	::ffff:192.168.2.1	2026-03-23 11:28:21.585458+00
403	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 11:28:35.069675+00
404	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 11:28:36.608676+00
405	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.568)	::ffff:192.168.2.1	2026-03-23 11:28:38.070016+00
406	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 11:28:45.586806+00
407	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 11:29:06.564237+00
408	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 11:29:11.044201+00
409	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.636)	::ffff:192.168.2.1	2026-03-23 11:29:12.589319+00
410	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.668)	::ffff:192.168.2.1	2026-03-23 11:29:14.064431+00
411	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 11:29:15.588558+00
412	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.614)	::ffff:192.168.2.1	2026-03-23 11:29:17.043662+00
413	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.587)	::ffff:192.168.2.1	2026-03-23 11:29:20.062321+00
414	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.561)	::ffff:192.168.2.1	2026-03-23 11:29:21.564165+00
415	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.622)	::ffff:192.168.2.1	2026-03-23 11:29:23.041427+00
416	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.568)	::ffff:192.168.2.1	2026-03-23 11:29:29.068381+00
417	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.600)	::ffff:192.168.2.1	2026-03-23 11:29:30.609903+00
418	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 11:29:32.044111+00
419	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.602)	::ffff:192.168.2.1	2026-03-23 11:29:33.611443+00
420	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 11:29:35.068234+00
421	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 11:29:39.5664+00
422	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.556)	::ffff:192.168.2.1	2026-03-23 11:29:41.087963+00
423	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.629)	::ffff:192.168.2.1	2026-03-23 11:29:42.56278+00
424	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.637)	::ffff:192.168.2.1	2026-03-23 11:29:47.067627+00
425	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.636)	::ffff:192.168.2.1	2026-03-23 11:29:48.567671+00
426	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.647)	::ffff:192.168.2.1	2026-03-23 11:29:50.178145+00
427	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.644)	::ffff:192.168.2.1	2026-03-23 11:29:51.564107+00
428	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.552)	::ffff:192.168.2.1	2026-03-23 11:29:53.067003+00
429	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.582)	::ffff:192.168.2.1	2026-03-23 11:29:53.114426+00
430	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.629)	::ffff:192.168.2.1	2026-03-23 11:29:54.565583+00
431	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.636)	::ffff:192.168.2.1	2026-03-23 11:29:56.064971+00
432	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.574)	::ffff:192.168.2.1	2026-03-23 11:29:57.568489+00
433	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.594)	::ffff:192.168.2.1	2026-03-23 11:29:59.070736+00
434	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.607)	::ffff:192.168.2.1	2026-03-23 11:30:00.565376+00
435	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.672)	::ffff:192.168.2.1	2026-03-23 11:30:02.069618+00
436	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.653)	::ffff:192.168.2.1	2026-03-23 11:30:03.590526+00
437	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.575)	::ffff:192.168.2.1	2026-03-23 11:30:06.588646+00
438	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.644)	::ffff:192.168.2.1	2026-03-23 11:30:08.089525+00
439	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.671)	::ffff:192.168.2.1	2026-03-23 11:30:11.067859+00
440	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.672)	::ffff:192.168.2.1	2026-03-23 11:30:12.567296+00
441	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.673)	::ffff:192.168.2.1	2026-03-23 11:30:14.067905+00
442	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.594)	::ffff:192.168.2.1	2026-03-23 11:30:15.563481+00
443	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.602)	::ffff:192.168.2.1	2026-03-23 11:30:17.066667+00
444	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.641)	::ffff:192.168.2.1	2026-03-23 11:30:18.577092+00
445	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.702)	::ffff:192.168.2.1	2026-03-23 11:30:21.563809+00
446	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.615)	::ffff:192.168.2.1	2026-03-23 11:30:23.065732+00
447	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.568)	::ffff:192.168.2.1	2026-03-23 11:30:24.564188+00
448	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.679)	::ffff:192.168.2.1	2026-03-23 11:30:26.064457+00
449	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.632)	::ffff:192.168.2.1	2026-03-23 11:30:27.564806+00
450	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-23 11:30:29.066109+00
451	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.681)	::ffff:192.168.2.1	2026-03-23 11:30:33.563419+00
452	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.631)	::ffff:192.168.2.1	2026-03-23 11:30:35.066161+00
453	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.561)	::ffff:192.168.2.1	2026-03-23 11:30:36.570262+00
454	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.652)	::ffff:192.168.2.1	2026-03-23 11:30:38.065581+00
455	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.661)	::ffff:192.168.2.1	2026-03-23 11:30:39.567736+00
456	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.657)	::ffff:192.168.2.1	2026-03-23 11:30:41.066605+00
457	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.659)	::ffff:192.168.2.1	2026-03-23 11:30:42.564882+00
458	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.708)	::ffff:192.168.2.1	2026-03-23 11:30:44.06765+00
459	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.691)	::ffff:192.168.2.1	2026-03-23 11:30:45.566639+00
460	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.738)	::ffff:192.168.2.1	2026-03-23 11:30:47.045583+00
461	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.562)	::ffff:192.168.2.1	2026-03-23 11:30:48.570091+00
462	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 11:30:50.069177+00
463	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.579)	::ffff:192.168.2.1	2026-03-23 11:30:51.568689+00
464	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.711)	::ffff:192.168.2.1	2026-03-23 11:30:53.069734+00
465	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.589)	::ffff:192.168.2.1	2026-03-23 11:30:54.56619+00
466	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.608)	::ffff:192.168.2.1	2026-03-23 11:30:56.067289+00
467	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.560)	::ffff:192.168.2.1	2026-03-23 11:30:57.56702+00
468	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.583)	::ffff:192.168.2.1	2026-03-23 11:31:00.567833+00
469	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.606)	::ffff:192.168.2.1	2026-03-23 11:31:02.067216+00
470	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.700)	::ffff:192.168.2.1	2026-03-23 11:31:03.567518+00
471	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.623)	::ffff:192.168.2.1	2026-03-23 11:31:05.065155+00
472	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.552)	::ffff:192.168.2.1	2026-03-23 11:31:08.065642+00
473	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.663)	::ffff:192.168.2.1	2026-03-23 11:31:09.587976+00
474	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.579)	::ffff:192.168.2.1	2026-03-23 11:31:11.063354+00
475	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.601)	::ffff:192.168.2.1	2026-03-23 11:31:12.584951+00
476	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.581)	::ffff:192.168.2.1	2026-03-23 11:31:14.065275+00
477	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.601)	::ffff:192.168.2.1	2026-03-23 11:31:15.585301+00
478	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.611)	::ffff:192.168.2.1	2026-03-23 11:31:17.047389+00
479	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.610)	::ffff:192.168.2.1	2026-03-23 11:31:18.588188+00
480	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.644)	::ffff:192.168.2.1	2026-03-23 11:31:20.044182+00
481	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 11:31:21.585272+00
482	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.551)	::ffff:192.168.2.1	2026-03-23 11:31:26.045167+00
483	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.727)	::ffff:192.168.2.1	2026-03-23 11:31:27.586616+00
484	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.636)	::ffff:192.168.2.1	2026-03-23 11:31:48.585574+00
485	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.629)	::ffff:192.168.2.1	2026-03-23 11:31:57.588197+00
486	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.630)	::ffff:192.168.2.1	2026-03-23 11:32:00.585106+00
487	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.553)	::ffff:192.168.2.1	2026-03-23 11:32:15.588046+00
488	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 11:32:17.045714+00
489	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.560)	::ffff:192.168.2.1	2026-03-23 11:32:18.58498+00
490	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.571)	::ffff:192.168.2.1	2026-03-23 11:32:21.590097+00
491	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.559)	::ffff:192.168.2.1	2026-03-23 11:32:24.584587+00
492	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.695)	::ffff:192.168.2.1	2026-03-23 11:32:30.606599+00
493	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.554)	::ffff:192.168.2.1	2026-03-23 11:32:35.064864+00
494	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.614)	::ffff:192.168.2.1	2026-03-23 11:32:36.607801+00
495	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.697)	::ffff:192.168.2.1	2026-03-23 11:32:38.065989+00
496	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.579)	::ffff:192.168.2.1	2026-03-23 11:32:51.607101+00
497	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.559)	::ffff:192.168.2.1	2026-03-23 11:32:54.606801+00
498	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.645)	::ffff:192.168.2.1	2026-03-23 11:32:59.064135+00
499	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.703)	::ffff:192.168.2.1	2026-03-23 11:33:05.064145+00
500	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.615)	::ffff:192.168.2.1	2026-03-23 11:33:06.608692+00
501	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.675)	::ffff:192.168.2.1	2026-03-23 11:33:08.065168+00
502	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.660)	::ffff:192.168.2.1	2026-03-23 11:33:09.608074+00
503	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 11:33:12.604132+00
504	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.670)	::ffff:192.168.2.1	2026-03-23 11:33:14.065103+00
505	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.626)	::ffff:192.168.2.1	2026-03-23 11:33:15.604996+00
506	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 11:33:17.065663+00
507	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.651)	::ffff:192.168.2.1	2026-03-23 11:33:18.605517+00
508	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.664)	::ffff:192.168.2.1	2026-03-23 11:33:20.0657+00
509	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 11:33:21.605522+00
510	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.595)	::ffff:192.168.2.1	2026-03-23 11:33:23.065398+00
511	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.590)	::ffff:192.168.2.1	2026-03-23 11:33:24.605989+00
512	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.620)	::ffff:192.168.2.1	2026-03-23 11:33:26.072579+00
513	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.693)	::ffff:192.168.2.1	2026-03-23 11:33:27.605164+00
514	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.576)	::ffff:192.168.2.1	2026-03-23 11:33:29.067148+00
515	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.686)	::ffff:192.168.2.1	2026-03-23 11:33:30.606033+00
516	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.675)	::ffff:192.168.2.1	2026-03-23 11:33:32.066736+00
517	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.662)	::ffff:192.168.2.1	2026-03-23 11:33:33.60804+00
518	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.628)	::ffff:192.168.2.1	2026-03-23 11:33:35.069001+00
519	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.649)	::ffff:192.168.2.1	2026-03-23 11:33:36.605119+00
520	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.647)	::ffff:192.168.2.1	2026-03-23 11:33:38.066296+00
521	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.703)	::ffff:192.168.2.1	2026-03-23 11:33:41.066533+00
522	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.569)	::ffff:192.168.2.1	2026-03-23 11:33:42.60435+00
523	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 11:33:45.605021+00
524	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.585)	::ffff:192.168.2.1	2026-03-23 11:33:47.065966+00
525	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.686)	::ffff:192.168.2.1	2026-03-23 11:33:48.60565+00
526	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.632)	::ffff:192.168.2.1	2026-03-23 11:33:51.605416+00
527	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-23 11:33:53.065002+00
528	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 11:33:59.063757+00
529	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.565)	::ffff:192.168.2.1	2026-03-23 11:34:00.605506+00
530	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.574)	::ffff:192.168.2.1	2026-03-23 11:34:02.064784+00
531	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.620)	::ffff:192.168.2.1	2026-03-23 11:34:17.066604+00
532	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.571)	::ffff:192.168.2.1	2026-03-23 11:34:20.064494+00
533	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.560)	::ffff:192.168.2.1	2026-03-23 11:34:30.607172+00
534	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.583)	::ffff:192.168.2.1	2026-03-23 11:34:33.604317+00
535	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.665)	::ffff:192.168.2.1	2026-03-23 11:34:35.091101+00
536	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.600)	::ffff:192.168.2.1	2026-03-23 11:34:36.605152+00
537	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.700)	::ffff:192.168.2.1	2026-03-23 11:34:38.085464+00
538	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.621)	::ffff:192.168.2.1	2026-03-23 11:34:39.603542+00
539	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.657)	::ffff:192.168.2.1	2026-03-23 11:34:41.064736+00
540	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.654)	::ffff:192.168.2.1	2026-03-23 11:34:44.108714+00
541	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.666)	::ffff:192.168.2.1	2026-03-23 11:34:45.649137+00
542	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.626)	::ffff:192.168.2.1	2026-03-23 11:34:48.62201+00
543	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.636)	::ffff:192.168.2.1	2026-03-23 11:34:50.066669+00
544	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.599)	::ffff:192.168.2.1	2026-03-23 11:34:51.633959+00
545	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.638)	::ffff:192.168.2.1	2026-03-23 11:34:53.087252+00
546	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.727)	::ffff:192.168.2.1	2026-03-23 11:34:56.086093+00
547	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.680)	::ffff:192.168.2.1	2026-03-23 11:34:59.113007+00
548	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.595)	::ffff:192.168.2.1	2026-03-23 11:35:00.64951+00
549	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 11:35:02.1089+00
550	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.569)	::ffff:192.168.2.1	2026-03-23 11:35:09.664005+00
551	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.550)	::ffff:192.168.2.1	2026-03-23 11:35:11.116281+00
552	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.671)	::ffff:192.168.2.1	2026-03-23 11:35:21.61047+00
553	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.569)	::ffff:192.168.2.1	2026-03-23 11:35:35.090142+00
554	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 11:35:41.091554+00
555	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.552)	::ffff:192.168.2.1	2026-03-23 11:35:44.111175+00
556	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.561)	::ffff:192.168.2.1	2026-03-23 11:35:48.651771+00
557	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 11:35:50.096771+00
558	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.583)	::ffff:192.168.2.1	2026-03-23 11:35:51.607593+00
559	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.556)	::ffff:192.168.2.1	2026-03-23 11:36:12.628535+00
560	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.578)	::ffff:192.168.2.1	2026-03-23 11:36:38.108702+00
561	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.647)	::ffff:192.168.2.1	2026-03-23 11:36:44.130995+00
562	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.629)	::ffff:192.168.2.1	2026-03-23 11:36:51.64845+00
563	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.628)	::ffff:192.168.2.1	2026-03-23 11:36:53.110601+00
564	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.677)	::ffff:192.168.2.1	2026-03-23 11:37:00.670584+00
565	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 11:37:02.130151+00
566	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.557)	::ffff:192.168.2.1	2026-03-23 11:37:03.669561+00
567	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.615)	::ffff:192.168.2.1	2026-03-23 11:37:06.645865+00
568	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.601)	::ffff:192.168.2.1	2026-03-23 11:37:15.674293+00
569	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.658)	::ffff:192.168.2.1	2026-03-23 11:37:17.132114+00
570	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-23 11:37:53.151397+00
571	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.565)	::ffff:192.168.2.1	2026-03-23 11:37:54.673629+00
572	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.615)	::ffff:192.168.2.1	2026-03-23 11:38:00.668099+00
573	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.618)	::ffff:192.168.2.1	2026-03-23 11:39:56.147961+00
574	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.653)	::ffff:192.168.2.1	2026-03-23 11:39:57.647857+00
575	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.667)	::ffff:192.168.2.1	2026-03-23 11:39:59.149862+00
576	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.691)	::ffff:192.168.2.1	2026-03-23 11:40:00.628416+00
577	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.667)	::ffff:192.168.2.1	2026-03-23 11:40:02.128926+00
578	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.686)	::ffff:192.168.2.1	2026-03-23 11:40:03.676321+00
579	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.688)	::ffff:192.168.2.1	2026-03-23 11:40:05.152456+00
580	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.609)	::ffff:192.168.2.1	2026-03-23 11:40:06.650734+00
581	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.553)	::ffff:192.168.2.1	2026-03-23 11:40:08.173669+00
582	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.638)	::ffff:192.168.2.1	2026-03-23 11:40:09.671384+00
583	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 11:40:11.170437+00
584	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.597)	::ffff:192.168.2.1	2026-03-23 11:40:45.649624+00
585	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.723)	::ffff:192.168.2.1	2026-03-23 11:40:47.147639+00
586	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.695)	::ffff:192.168.2.1	2026-03-23 11:40:53.19853+00
587	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.713)	::ffff:192.168.2.1	2026-03-23 11:40:54.630617+00
588	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.697)	::ffff:192.168.2.1	2026-03-23 11:40:56.152475+00
589	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.574)	::ffff:192.168.2.1	2026-03-23 11:41:00.672934+00
590	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 11:41:08.152618+00
591	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.590)	::ffff:192.168.2.1	2026-03-23 11:41:09.711059+00
592	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.565)	::ffff:192.168.2.1	2026-03-23 11:41:11.151606+00
593	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.671)	::ffff:192.168.2.1	2026-03-23 11:41:12.670827+00
594	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.672)	::ffff:192.168.2.1	2026-03-23 11:41:20.127646+00
595	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.589)	::ffff:192.168.2.1	2026-03-23 11:41:21.647654+00
596	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.709)	::ffff:192.168.2.1	2026-03-23 11:41:24.66816+00
597	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.696)	::ffff:192.168.2.1	2026-03-23 11:41:26.147182+00
598	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.572)	::ffff:192.168.2.1	2026-03-23 11:41:27.668575+00
599	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.639)	::ffff:192.168.2.1	2026-03-23 11:41:30.668981+00
600	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.617)	::ffff:192.168.2.1	2026-03-23 11:41:32.149534+00
601	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-23 11:41:39.669638+00
602	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 11:41:41.151016+00
603	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.585)	::ffff:192.168.2.1	2026-03-23 11:41:42.658749+00
604	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.582)	::ffff:192.168.2.1	2026-03-23 11:41:44.168531+00
605	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.576)	::ffff:192.168.2.1	2026-03-23 11:41:50.147722+00
606	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.600)	::ffff:192.168.2.1	2026-03-23 11:41:56.168845+00
607	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.611)	::ffff:192.168.2.1	2026-03-23 11:42:00.647017+00
608	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.621)	::ffff:192.168.2.1	2026-03-23 11:42:02.145772+00
609	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.624)	::ffff:192.168.2.1	2026-03-23 11:42:03.647655+00
610	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.621)	::ffff:192.168.2.1	2026-03-23 11:42:05.147882+00
611	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 11:42:08.149586+00
612	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.649)	::ffff:192.168.2.1	2026-03-23 11:42:11.148653+00
613	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.640)	::ffff:192.168.2.1	2026-03-23 11:42:12.651359+00
614	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.619)	::ffff:192.168.2.1	2026-03-23 11:42:15.650831+00
615	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 11:42:17.127578+00
616	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.617)	::ffff:192.168.2.1	2026-03-23 11:42:24.629766+00
617	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.595)	::ffff:192.168.2.1	2026-03-23 11:42:26.127539+00
618	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.608)	::ffff:192.168.2.1	2026-03-23 11:42:27.628202+00
619	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.561)	::ffff:192.168.2.1	2026-03-23 11:42:48.669882+00
620	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.590)	::ffff:192.168.2.1	2026-03-23 11:42:57.66793+00
621	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.607)	::ffff:192.168.2.1	2026-03-23 11:43:06.689953+00
622	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.595)	::ffff:192.168.2.1	2026-03-23 11:43:20.154691+00
623	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 11:43:21.670648+00
624	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.605)	::ffff:192.168.2.1	2026-03-23 11:43:23.17124+00
625	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.601)	::ffff:192.168.2.1	2026-03-23 11:43:27.692195+00
626	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.560)	::ffff:192.168.2.1	2026-03-23 11:43:29.168814+00
627	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.670)	::ffff:192.168.2.1	2026-03-23 11:43:30.690693+00
628	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 11:43:32.170866+00
629	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.561)	::ffff:192.168.2.1	2026-03-23 11:43:33.668592+00
630	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.559)	::ffff:192.168.2.1	2026-03-23 11:43:36.672197+00
631	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.645)	::ffff:192.168.2.1	2026-03-23 11:43:45.783387+00
632	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 11:43:47.176034+00
633	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.591)	::ffff:192.168.2.1	2026-03-23 11:43:48.701752+00
634	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.629)	::ffff:192.168.2.1	2026-03-23 11:43:50.155265+00
635	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.597)	::ffff:192.168.2.1	2026-03-23 11:43:51.676564+00
636	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-23 11:44:09.715525+00
637	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.599)	::ffff:192.168.2.1	2026-03-23 11:44:11.178561+00
638	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.620)	::ffff:192.168.2.1	2026-03-23 11:44:12.719436+00
639	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.605)	::ffff:192.168.2.1	2026-03-23 11:44:14.179964+00
640	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.602)	::ffff:192.168.2.1	2026-03-23 11:44:15.725652+00
641	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.629)	::ffff:192.168.2.1	2026-03-23 11:44:17.17321+00
642	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.619)	::ffff:192.168.2.1	2026-03-23 11:44:18.696601+00
643	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.575)	::ffff:192.168.2.1	2026-03-23 11:44:20.206012+00
644	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.646)	::ffff:192.168.2.1	2026-03-23 11:44:26.191601+00
645	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.693)	::ffff:192.168.2.1	2026-03-23 11:44:27.717915+00
646	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.653)	::ffff:192.168.2.1	2026-03-23 11:44:29.192709+00
647	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.648)	::ffff:192.168.2.1	2026-03-23 11:44:30.924907+00
648	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.628)	::ffff:192.168.2.1	2026-03-23 11:44:32.192024+00
649	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.657)	::ffff:192.168.2.1	2026-03-23 11:44:33.719052+00
650	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.618)	::ffff:192.168.2.1	2026-03-23 11:44:35.192598+00
651	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 11:44:38.16777+00
652	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.568)	::ffff:192.168.2.1	2026-03-23 11:44:39.68867+00
653	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 11:44:42.688135+00
654	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.620)	::ffff:192.168.2.1	2026-03-23 11:44:50.144335+00
655	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.554)	::ffff:192.168.2.1	2026-03-23 11:44:56.169017+00
656	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-23 11:44:59.17014+00
657	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.648)	::ffff:192.168.2.1	2026-03-23 11:45:00.668767+00
658	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 11:45:02.188942+00
659	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.648)	::ffff:192.168.2.1	2026-03-23 11:45:05.167546+00
660	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.587)	::ffff:192.168.2.1	2026-03-23 11:45:06.64602+00
661	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.595)	::ffff:192.168.2.1	2026-03-23 11:45:09.688788+00
662	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.640)	::ffff:192.168.2.1	2026-03-23 11:45:11.190306+00
663	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 11:45:15.695174+00
664	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 11:45:18.692934+00
665	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.557)	::ffff:192.168.2.1	2026-03-23 11:45:20.190508+00
666	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.551)	::ffff:192.168.2.1	2026-03-23 11:45:26.166677+00
667	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.647)	::ffff:192.168.2.1	2026-03-23 11:45:27.688316+00
668	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.582)	::ffff:192.168.2.1	2026-03-23 11:45:35.191819+00
669	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 11:45:36.694317+00
670	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 11:45:38.190615+00
671	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 11:45:39.691726+00
672	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.634)	::ffff:192.168.2.1	2026-03-23 11:45:41.192+00
673	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.626)	::ffff:192.168.2.1	2026-03-23 11:45:42.690146+00
674	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.694)	::ffff:192.168.2.1	2026-03-23 11:45:44.169546+00
675	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.646)	::ffff:192.168.2.1	2026-03-23 11:45:45.690439+00
676	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.657)	::ffff:192.168.2.1	2026-03-23 11:45:54.666322+00
677	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 11:45:56.143746+00
678	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 11:46:02.193318+00
679	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 11:46:06.727414+00
680	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.645)	::ffff:192.168.2.1	2026-03-23 11:46:08.211148+00
681	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.591)	::ffff:192.168.2.1	2026-03-23 11:46:09.719495+00
682	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.575)	::ffff:192.168.2.1	2026-03-23 11:46:17.198687+00
683	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.568)	::ffff:192.168.2.1	2026-03-23 11:46:18.736959+00
684	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.652)	::ffff:192.168.2.1	2026-03-23 11:46:20.196003+00
685	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.586)	::ffff:192.168.2.1	2026-03-23 11:46:21.739664+00
686	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.631)	::ffff:192.168.2.1	2026-03-23 11:46:23.192803+00
687	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.590)	::ffff:192.168.2.1	2026-03-23 11:46:26.195489+00
688	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.598)	::ffff:192.168.2.1	2026-03-23 11:46:27.731932+00
689	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.634)	::ffff:192.168.2.1	2026-03-23 11:46:29.535303+00
690	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 11:46:30.970042+00
691	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.571)	::ffff:192.168.2.1	2026-03-23 11:46:36.971007+00
692	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.589)	::ffff:192.168.2.1	2026-03-23 11:46:42.968831+00
693	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.608)	::ffff:192.168.2.1	2026-03-23 11:46:50.506317+00
694	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.550)	::ffff:192.168.2.1	2026-03-23 11:46:51.967427+00
695	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 11:47:08.963784+00
696	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.671)	::ffff:192.168.2.1	2026-03-23 11:47:13.50658+00
697	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.619)	::ffff:192.168.2.1	2026-03-23 11:47:16.479649+00
698	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-23 11:47:19.460812+00
699	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.757)	::ffff:192.168.2.1	2026-03-23 11:47:35.371058+00
700	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.611)	::ffff:192.168.2.1	2026-03-23 11:47:36.860893+00
701	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.602)	::ffff:192.168.2.1	2026-03-23 11:47:38.362748+00
702	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.558)	::ffff:192.168.2.1	2026-03-23 11:47:48.910562+00
703	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.624)	::ffff:192.168.2.1	2026-03-23 11:47:50.371131+00
704	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.583)	::ffff:192.168.2.1	2026-03-23 11:47:51.909006+00
705	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.589)	::ffff:192.168.2.1	2026-03-23 11:47:53.387967+00
706	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.571)	::ffff:192.168.2.1	2026-03-23 11:47:54.905616+00
707	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.562)	::ffff:192.168.2.1	2026-03-23 11:47:56.365408+00
708	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.574)	::ffff:192.168.2.1	2026-03-23 11:47:57.906763+00
709	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.585)	::ffff:192.168.2.1	2026-03-23 11:47:59.38609+00
710	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.623)	::ffff:192.168.2.1	2026-03-23 11:48:02.392118+00
711	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.658)	::ffff:192.168.2.1	2026-03-23 11:48:03.884631+00
712	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.567)	::ffff:192.168.2.1	2026-03-23 11:48:06.884139+00
713	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.634)	::ffff:192.168.2.1	2026-03-23 11:48:08.390085+00
714	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.597)	::ffff:192.168.2.1	2026-03-23 11:48:11.372228+00
715	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.667)	::ffff:192.168.2.1	2026-03-23 11:48:12.907093+00
716	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.656)	::ffff:192.168.2.1	2026-03-23 11:48:14.403321+00
717	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.649)	::ffff:192.168.2.1	2026-03-23 11:48:17.404923+00
718	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.551)	::ffff:192.168.2.1	2026-03-23 11:48:23.385026+00
719	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.601)	::ffff:192.168.2.1	2026-03-23 11:48:24.929402+00
720	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.575)	::ffff:192.168.2.1	2026-03-23 11:48:27.908176+00
721	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.609)	::ffff:192.168.2.1	2026-03-23 11:48:29.388351+00
722	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 11:48:30.951015+00
723	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.608)	::ffff:192.168.2.1	2026-03-23 11:48:33.952172+00
724	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.632)	::ffff:192.168.2.1	2026-03-23 11:48:35.433341+00
725	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.554)	::ffff:192.168.2.1	2026-03-23 11:48:38.431538+00
726	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.605)	::ffff:192.168.2.1	2026-03-23 11:48:41.409089+00
727	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.676)	::ffff:192.168.2.1	2026-03-23 11:48:42.932566+00
728	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.582)	::ffff:192.168.2.1	2026-03-23 11:48:44.409188+00
729	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.645)	::ffff:192.168.2.1	2026-03-23 11:48:47.436552+00
730	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.567)	::ffff:192.168.2.1	2026-03-23 11:48:48.929962+00
731	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.572)	::ffff:192.168.2.1	2026-03-23 11:48:51.954996+00
732	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.599)	::ffff:192.168.2.1	2026-03-23 11:48:53.411164+00
733	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-23 11:48:56.409304+00
734	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.639)	::ffff:192.168.2.1	2026-03-23 11:49:02.43116+00
735	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.591)	::ffff:192.168.2.1	2026-03-23 11:49:03.951183+00
736	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 11:49:05.433941+00
737	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.586)	::ffff:192.168.2.1	2026-03-23 11:49:06.950009+00
738	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.712)	::ffff:192.168.2.1	2026-03-23 11:49:08.386793+00
739	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.664)	::ffff:192.168.2.1	2026-03-23 11:49:09.929159+00
740	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.616)	::ffff:192.168.2.1	2026-03-23 11:49:11.432761+00
741	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.565)	::ffff:192.168.2.1	2026-03-23 11:49:12.951061+00
742	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.559)	::ffff:192.168.2.1	2026-03-23 11:49:14.412417+00
743	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-23 11:49:15.953972+00
744	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.595)	::ffff:192.168.2.1	2026-03-23 11:49:17.415349+00
745	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.574)	::ffff:192.168.2.1	2026-03-23 11:49:20.43507+00
746	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.613)	::ffff:192.168.2.1	2026-03-23 11:49:21.957402+00
747	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.582)	::ffff:192.168.2.1	2026-03-23 11:49:23.397423+00
748	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.579)	::ffff:192.168.2.1	2026-03-23 11:49:24.933104+00
749	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.670)	::ffff:192.168.2.1	2026-03-23 11:49:26.411127+00
750	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.597)	::ffff:192.168.2.1	2026-03-23 11:49:27.95526+00
751	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.608)	::ffff:192.168.2.1	2026-03-23 11:49:30.950754+00
752	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.630)	::ffff:192.168.2.1	2026-03-23 11:49:32.432199+00
753	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.612)	::ffff:192.168.2.1	2026-03-23 11:49:33.952722+00
754	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 11:49:35.430959+00
755	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.590)	::ffff:192.168.2.1	2026-03-23 11:49:36.930231+00
756	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.620)	::ffff:192.168.2.1	2026-03-23 11:49:38.411053+00
757	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.605)	::ffff:192.168.2.1	2026-03-23 11:49:41.409516+00
758	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.553)	::ffff:192.168.2.1	2026-03-23 11:49:56.389717+00
759	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.613)	::ffff:192.168.2.1	2026-03-23 11:50:00.907942+00
760	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 11:50:02.408344+00
761	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.631)	::ffff:192.168.2.1	2026-03-23 11:50:03.929693+00
762	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.640)	::ffff:192.168.2.1	2026-03-23 11:50:05.41025+00
763	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.575)	::ffff:192.168.2.1	2026-03-23 11:50:06.929342+00
764	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.552)	::ffff:192.168.2.1	2026-03-23 11:50:08.407875+00
765	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.603)	::ffff:192.168.2.1	2026-03-23 11:50:09.951921+00
766	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.630)	::ffff:192.168.2.1	2026-03-23 11:50:15.929379+00
767	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.586)	::ffff:192.168.2.1	2026-03-23 11:50:32.411759+00
768	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.591)	::ffff:192.168.2.1	2026-03-23 11:50:33.931268+00
769	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.601)	::ffff:192.168.2.1	2026-03-23 11:50:35.412386+00
770	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.697)	::ffff:192.168.2.1	2026-03-23 11:50:36.907684+00
771	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 11:52:24.93145+00
772	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 11:52:26.430689+00
773	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.574)	::ffff:192.168.2.1	2026-03-23 11:52:27.930421+00
774	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 11:52:30.952598+00
775	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 11:52:32.432992+00
776	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.566)	::ffff:192.168.2.1	2026-03-23 11:52:42.932369+00
777	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.582)	::ffff:192.168.2.1	2026-03-23 11:52:51.967609+00
778	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.603)	::ffff:192.168.2.1	2026-03-23 11:53:42.927247+00
779	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-23 11:53:44.429696+00
780	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 11:53:45.948494+00
781	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.566)	::ffff:192.168.2.1	2026-03-23 11:53:47.434261+00
782	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.616)	::ffff:192.168.2.1	2026-03-23 11:53:50.406144+00
783	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-23 11:54:04.183216+00
784	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.596)	::ffff:192.168.2.1	2026-03-23 11:54:11.434877+00
785	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.628)	::ffff:192.168.2.1	2026-03-23 12:38:08.698373+00
786	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.603)	::ffff:192.168.2.1	2026-03-23 12:38:13.19846+00
787	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.591)	::ffff:192.168.2.1	2026-03-23 12:38:14.679264+00
788	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.658)	::ffff:192.168.2.1	2026-03-23 12:38:16.196623+00
789	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.585)	::ffff:192.168.2.1	2026-03-23 12:38:20.700786+00
790	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.629)	::ffff:192.168.2.1	2026-03-23 12:38:52.239874+00
791	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.552)	::ffff:192.168.2.1	2026-03-23 12:38:58.220703+00
792	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.623)	::ffff:192.168.2.1	2026-03-23 12:39:46.222479+00
793	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 12:39:47.697893+00
794	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.609)	::ffff:192.168.2.1	2026-03-23 12:39:52.200639+00
795	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.650)	::ffff:192.168.2.1	2026-03-23 12:39:53.697974+00
796	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.658)	::ffff:192.168.2.1	2026-03-23 12:39:55.199144+00
797	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 12:39:56.746011+00
798	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.644)	::ffff:192.168.2.1	2026-03-23 12:40:04.197786+00
799	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.638)	::ffff:192.168.2.1	2026-03-23 12:40:05.697401+00
800	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.602)	::ffff:192.168.2.1	2026-03-23 12:40:07.236468+00
801	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.572)	::ffff:192.168.2.1	2026-03-23 12:40:08.721092+00
802	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.640)	::ffff:192.168.2.1	2026-03-23 12:40:10.259272+00
803	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.571)	::ffff:192.168.2.1	2026-03-23 12:40:11.699763+00
804	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 12:40:13.26289+00
805	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.601)	::ffff:192.168.2.1	2026-03-23 12:40:14.701588+00
806	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.582)	::ffff:192.168.2.1	2026-03-23 12:40:17.700998+00
807	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.572)	::ffff:192.168.2.1	2026-03-23 12:40:19.265826+00
808	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.586)	::ffff:192.168.2.1	2026-03-23 12:40:20.702674+00
809	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.593)	::ffff:192.168.2.1	2026-03-23 12:40:22.241476+00
810	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.605)	::ffff:192.168.2.1	2026-03-23 12:40:26.728699+00
811	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-23 12:40:28.217396+00
812	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 12:40:29.722357+00
813	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.645)	::ffff:192.168.2.1	2026-03-23 12:40:31.240115+00
814	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.614)	::ffff:192.168.2.1	2026-03-23 12:40:32.719924+00
815	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.649)	::ffff:192.168.2.1	2026-03-23 12:41:17.788996+00
816	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.656)	::ffff:192.168.2.1	2026-03-23 12:41:19.220109+00
817	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.596)	::ffff:192.168.2.1	2026-03-23 12:41:20.721235+00
818	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.609)	::ffff:192.168.2.1	2026-03-23 12:41:22.218833+00
819	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.653)	::ffff:192.168.2.1	2026-03-23 12:41:23.720781+00
820	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.629)	::ffff:192.168.2.1	2026-03-23 12:41:25.220358+00
821	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.687)	::ffff:192.168.2.1	2026-03-23 12:41:26.723887+00
822	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 12:41:28.21862+00
823	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.582)	::ffff:192.168.2.1	2026-03-23 12:41:29.719593+00
824	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.617)	::ffff:192.168.2.1	2026-03-23 12:41:31.219741+00
825	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.655)	::ffff:192.168.2.1	2026-03-23 12:41:32.719895+00
826	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.604)	::ffff:192.168.2.1	2026-03-23 12:41:34.221968+00
827	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.692)	::ffff:192.168.2.1	2026-03-23 12:41:35.720223+00
828	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.616)	::ffff:192.168.2.1	2026-03-23 12:41:38.720178+00
829	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.557)	::ffff:192.168.2.1	2026-03-23 12:41:40.219119+00
830	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.661)	::ffff:192.168.2.1	2026-03-23 12:41:41.720616+00
831	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 12:41:43.222825+00
832	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.555)	::ffff:192.168.2.1	2026-03-23 12:41:49.246596+00
833	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 12:41:50.719452+00
834	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.599)	::ffff:192.168.2.1	2026-03-23 12:41:52.244969+00
835	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.631)	::ffff:192.168.2.1	2026-03-23 12:41:53.722111+00
836	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.585)	::ffff:192.168.2.1	2026-03-23 12:41:55.221161+00
837	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.627)	::ffff:192.168.2.1	2026-03-23 12:41:56.740694+00
838	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.646)	::ffff:192.168.2.1	2026-03-23 12:41:58.220233+00
839	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.608)	::ffff:192.168.2.1	2026-03-23 12:41:59.721179+00
840	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.680)	::ffff:192.168.2.1	2026-03-23 12:42:01.243205+00
841	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.667)	::ffff:192.168.2.1	2026-03-23 12:42:02.761955+00
842	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.622)	::ffff:192.168.2.1	2026-03-23 12:42:04.241601+00
843	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.662)	::ffff:192.168.2.1	2026-03-23 12:42:05.741163+00
844	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.598)	::ffff:192.168.2.1	2026-03-23 12:42:07.23979+00
845	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.624)	::ffff:192.168.2.1	2026-03-23 12:42:08.719453+00
846	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.638)	::ffff:192.168.2.1	2026-03-23 12:42:10.239558+00
847	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.661)	::ffff:192.168.2.1	2026-03-23 12:42:11.741316+00
848	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.709)	::ffff:192.168.2.1	2026-03-23 12:42:13.262052+00
849	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.672)	::ffff:192.168.2.1	2026-03-23 12:42:14.718746+00
850	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.643)	::ffff:192.168.2.1	2026-03-23 12:42:16.238662+00
851	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.658)	::ffff:192.168.2.1	2026-03-23 12:42:17.721888+00
852	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.645)	::ffff:192.168.2.1	2026-03-23 12:42:19.238856+00
853	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.639)	::ffff:192.168.2.1	2026-03-23 12:42:20.72173+00
854	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.651)	::ffff:192.168.2.1	2026-03-23 12:42:22.260367+00
855	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.687)	::ffff:192.168.2.1	2026-03-23 12:42:23.734999+00
856	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.701)	::ffff:192.168.2.1	2026-03-23 12:42:25.239363+00
857	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 12:42:26.703182+00
858	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.583)	::ffff:192.168.2.1	2026-03-23 12:42:28.239829+00
859	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.589)	::ffff:192.168.2.1	2026-03-23 12:42:29.723404+00
860	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.607)	::ffff:192.168.2.1	2026-03-23 12:42:31.253776+00
861	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.685)	::ffff:192.168.2.1	2026-03-23 12:42:32.700745+00
862	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.686)	::ffff:192.168.2.1	2026-03-23 12:42:34.239496+00
863	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 12:42:35.723686+00
864	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.608)	::ffff:192.168.2.1	2026-03-23 12:43:04.239936+00
865	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.558)	::ffff:192.168.2.1	2026-03-23 12:43:05.702414+00
866	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.560)	::ffff:192.168.2.1	2026-03-23 12:43:10.239296+00
867	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.584)	::ffff:192.168.2.1	2026-03-23 12:43:11.70036+00
868	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.557)	::ffff:192.168.2.1	2026-03-23 12:43:19.24001+00
869	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-23 12:43:25.240771+00
870	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.649)	::ffff:192.168.2.1	2026-03-23 12:43:28.23998+00
871	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.689)	::ffff:192.168.2.1	2026-03-23 12:43:29.700889+00
872	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.682)	::ffff:192.168.2.1	2026-03-23 12:43:31.237913+00
873	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.636)	::ffff:192.168.2.1	2026-03-23 12:43:32.739506+00
874	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.578)	::ffff:192.168.2.1	2026-03-23 12:43:34.265081+00
875	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.568)	::ffff:192.168.2.1	2026-03-23 12:43:35.768521+00
876	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-23 12:43:41.74732+00
877	1	1	1	\N	2	face.enroll.delete	Face enrollment removed for employee 45 (1 embedding(s) deleted)	::ffff:192.168.2.1	2026-03-23 12:47:50.61128+00
878	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-23 12:49:40.283828+00
879	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 14:16:10.988075+00
880	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.577)	::ffff:192.168.2.1	2026-03-23 14:16:10.992331+00
881	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 14:16:12.524485+00
882	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.592)	::ffff:192.168.2.1	2026-03-23 14:16:12.527682+00
883	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.663)	::ffff:192.168.2.1	2026-03-24 05:40:37.740455+00
884	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.571)	::ffff:192.168.2.1	2026-03-24 05:42:24.272141+00
885	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.616)	::ffff:192.168.2.1	2026-03-24 05:42:27.271296+00
886	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.580)	::ffff:192.168.2.1	2026-03-24 05:42:28.758423+00
887	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.614)	::ffff:192.168.2.1	2026-03-24 05:42:30.272286+00
888	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.653)	::ffff:192.168.2.1	2026-03-24 05:42:31.750777+00
889	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.622)	::ffff:192.168.2.1	2026-03-24 05:42:33.269075+00
890	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.598)	::ffff:192.168.2.1	2026-03-24 05:42:34.771759+00
891	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.628)	::ffff:192.168.2.1	2026-03-24 05:42:36.269105+00
892	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.571)	::ffff:192.168.2.1	2026-03-24 05:42:51.268694+00
893	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.572)	::ffff:192.168.2.1	2026-03-24 05:42:52.770929+00
894	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-24 05:42:55.767253+00
895	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.608)	::ffff:192.168.2.1	2026-03-24 05:42:58.766565+00
896	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.651)	::ffff:192.168.2.1	2026-03-24 05:43:01.766887+00
897	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.611)	::ffff:192.168.2.1	2026-03-24 05:43:06.26612+00
898	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.573)	::ffff:192.168.2.1	2026-03-24 05:46:19.77149+00
899	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.558)	::ffff:192.168.2.1	2026-03-24 05:46:22.768645+00
900	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.568)	::ffff:192.168.2.1	2026-03-24 05:46:31.766266+00
901	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.705)	::ffff:192.168.2.1	2026-03-24 05:46:34.768868+00
902	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.561)	::ffff:192.168.2.1	2026-03-24 05:47:03.310525+00
903	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.609)	::ffff:192.168.2.1	2026-03-24 05:47:04.772536+00
904	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.709)	::ffff:192.168.2.1	2026-03-24 05:50:30.210824+00
905	1	1	1	\N	2	face.enroll.delete	Face enrollment removed for employee 47 (1 embedding(s) deleted)	::ffff:192.168.2.1	2026-03-24 05:50:30.63868+00
906	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.634)	::ffff:192.168.2.1	2026-03-24 05:50:40.606343+00
907	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.630)	::ffff:192.168.2.1	2026-03-24 05:50:42.130917+00
908	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.607)	::ffff:192.168.2.1	2026-03-24 05:50:43.605549+00
909	1	1	1	\N	1	attendance.mark	Attendance marked: yeshwanth via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-24 05:50:45.131255+00
910	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.966)	::ffff:192.168.2.1	2026-03-24 05:50:46.610283+00
911	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.958)	::ffff:192.168.2.1	2026-03-24 05:50:48.132697+00
912	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.946)	::ffff:192.168.2.1	2026-03-24 05:50:49.608475+00
913	1	1	1	\N	2	face.enroll.delete	Face enrollment removed for employee 44 (2 embedding(s) deleted)	::ffff:192.168.2.1	2026-03-24 05:51:13.902639+00
914	1	1	1	\N	2	face.enroll.delete	Face enrollment removed for employee 46 (2 embedding(s) deleted)	::ffff:192.168.2.1	2026-03-24 05:52:18.810449+00
915	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.930)	::ffff:192.168.2.1	2026-03-24 05:52:43.545163+00
916	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.921)	::ffff:192.168.2.1	2026-03-24 05:52:45.01952+00
917	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.679)	::ffff:192.168.2.1	2026-03-24 05:53:36.026074+00
918	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.710)	::ffff:192.168.2.1	2026-03-24 05:53:37.571103+00
919	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.724)	::ffff:192.168.2.1	2026-03-24 05:53:40.572772+00
920	1	1	1	\N	1	attendance.mark	Attendance marked: Karthik via device entrance-cam-01 (sim=0.564)	::ffff:192.168.2.1	2026-03-24 05:55:21.102147+00
921	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.648)	::ffff:192.168.2.1	2026-03-24 05:55:57.062521+00
922	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.559)	::ffff:192.168.2.1	2026-03-24 05:57:51.082662+00
923	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.887)	::ffff:192.168.2.1	2026-03-24 05:58:12.398129+00
924	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.892)	::ffff:192.168.2.1	2026-03-24 05:58:14.075456+00
925	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.901)	::ffff:192.168.2.1	2026-03-24 05:58:15.39221+00
926	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.620)	::ffff:192.168.2.1	2026-03-24 05:58:17.07416+00
927	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.615)	::ffff:192.168.2.1	2026-03-24 05:58:18.615378+00
928	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.628)	::ffff:192.168.2.1	2026-03-24 05:58:19.90294+00
929	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.808)	::ffff:192.168.2.1	2026-03-24 05:58:21.393982+00
930	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.750)	::ffff:192.168.2.1	2026-03-24 05:58:22.87905+00
931	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.745)	::ffff:192.168.2.1	2026-03-24 05:58:24.396782+00
932	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.791)	::ffff:192.168.2.1	2026-03-24 05:58:25.872705+00
933	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.865)	::ffff:192.168.2.1	2026-03-24 05:58:33.422219+00
959	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.567)	::ffff:192.168.2.1	2026-03-24 05:59:43.894241+00
960	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.587)	::ffff:192.168.2.1	2026-03-24 05:59:46.892958+00
961	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.633)	::ffff:192.168.2.1	2026-03-24 05:59:48.388864+00
962	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.553)	::ffff:192.168.2.1	2026-03-24 05:59:49.869055+00
963	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.597)	::ffff:192.168.2.1	2026-03-24 05:59:51.389387+00
974	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.588)	::ffff:192.168.2.1	2026-03-24 06:00:34.870724+00
975	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.570)	::ffff:192.168.2.1	2026-03-24 06:00:39.408625+00
976	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.563)	::ffff:192.168.2.1	2026-03-24 06:00:40.867779+00
977	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.570)	::ffff:192.168.2.1	2026-03-24 06:00:46.870987+00
978	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.568)	::ffff:192.168.2.1	2026-03-24 06:00:51.407401+00
934	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.768)	::ffff:192.168.2.1	2026-03-24 05:58:44.111852+00
935	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.802)	::ffff:192.168.2.1	2026-03-24 05:58:45.395795+00
936	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.849)	::ffff:192.168.2.1	2026-03-24 05:58:46.874014+00
937	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.865)	::ffff:192.168.2.1	2026-03-24 05:58:48.392935+00
938	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.823)	::ffff:192.168.2.1	2026-03-24 05:58:49.871327+00
939	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.868)	::ffff:192.168.2.1	2026-03-24 05:58:51.580301+00
940	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.825)	::ffff:192.168.2.1	2026-03-24 05:58:52.872357+00
941	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.876)	::ffff:192.168.2.1	2026-03-24 05:58:54.392255+00
942	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.750)	::ffff:192.168.2.1	2026-03-24 05:58:56.072455+00
943	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.816)	::ffff:192.168.2.1	2026-03-24 05:58:57.592137+00
944	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.847)	::ffff:192.168.2.1	2026-03-24 05:58:58.896457+00
945	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.856)	::ffff:192.168.2.1	2026-03-24 05:59:02.278718+00
946	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.853)	::ffff:192.168.2.1	2026-03-24 05:59:03.617291+00
947	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.849)	::ffff:192.168.2.1	2026-03-24 05:59:05.07294+00
948	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.840)	::ffff:192.168.2.1	2026-03-24 05:59:06.392809+00
949	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.714)	::ffff:192.168.2.1	2026-03-24 05:59:08.130463+00
950	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.778)	::ffff:192.168.2.1	2026-03-24 05:59:09.39072+00
951	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.777)	::ffff:192.168.2.1	2026-03-24 05:59:11.074898+00
952	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.807)	::ffff:192.168.2.1	2026-03-24 05:59:12.388805+00
953	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.565)	::ffff:192.168.2.1	2026-03-24 05:59:17.073503+00
954	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.663)	::ffff:192.168.2.1	2026-03-24 05:59:18.387858+00
955	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.636)	::ffff:192.168.2.1	2026-03-24 05:59:19.88902+00
956	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.671)	::ffff:192.168.2.1	2026-03-24 05:59:21.389032+00
957	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.662)	::ffff:192.168.2.1	2026-03-24 05:59:22.866963+00
958	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.642)	::ffff:192.168.2.1	2026-03-24 05:59:24.409687+00
964	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.579)	::ffff:192.168.2.1	2026-03-24 05:59:54.387849+00
965	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.667)	::ffff:192.168.2.1	2026-03-24 05:59:55.866686+00
966	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.637)	::ffff:192.168.2.1	2026-03-24 05:59:57.387201+00
967	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.609)	::ffff:192.168.2.1	2026-03-24 05:59:58.885237+00
968	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.715)	::ffff:192.168.2.1	2026-03-24 06:00:00.412254+00
969	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.719)	::ffff:192.168.2.1	2026-03-24 06:00:01.893016+00
970	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.738)	::ffff:192.168.2.1	2026-03-24 06:00:03.407807+00
971	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.730)	::ffff:192.168.2.1	2026-03-24 06:00:04.866903+00
972	1	1	1	\N	1	attendance.mark	Attendance marked: Sai Dinesh via device entrance-cam-01 (sim=0.558)	::ffff:192.168.2.1	2026-03-24 06:00:06.408799+00
973	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.755)	::ffff:192.168.2.1	2026-03-24 06:00:06.457369+00
979	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.609)	::ffff:192.168.2.1	2026-03-24 06:00:54.432177+00
980	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.557)	::ffff:192.168.2.1	2026-03-24 06:03:16.903425+00
981	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.558)	::ffff:192.168.2.1	2026-03-24 06:03:25.927038+00
982	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.569)	::ffff:192.168.2.1	2026-03-24 06:03:28.902409+00
983	1	1	1	\N	1	attendance.mark	Attendance marked: ramalinga via device entrance-cam-01 (sim=0.636)	::ffff:192.168.2.1	2026-03-24 06:03:55.901717+00
\.


--
-- Data for Name: auth_session_token; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.auth_session_token (token_id, fk_user_id, access_token, refresh_token, access_expires_at, refresh_expires_at, revoked, user_agent, ip_address, created_at) FROM stdin;
cab6f9a4-5082-4bb7-a2e9-56b9447cbedc	1	5bfebd49ecda7da55b034aea8e446771cffabe36b544d71501bfedb1e05fc67f	70d73d3950fcd3db1a83addc9615f68ec45b43ebd6ec4da9737baa99cf32ac70	2026-03-19 11:24:16.829+00	2026-03-26 10:54:16.829+00	f	curl/7.81.0	172.20.100.222	2026-03-19 10:54:16.830531+00
\.


--
-- Data for Name: device_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.device_events (pk_event_id, fk_device_id, event_type, occurred_at, received_at, processed_at, processing_status, payload_json, detected_face_embedding, confidence_score, frame_url, processing_attempts, processing_error) FROM stdin;
\.


--
-- Data for Name: devices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.devices (pk_device_id, device_code, device_name, device_type, fk_site_id, location_description, ip_address, mac_address, keycloak_client_id, api_key_hash, status, config_json, capabilities, last_heartbeat_at, last_seen_at, firmware_version, created_at, updated_at, camera_mode) FROM stdin;
c2bf8325-553c-4c1a-9576-d4aee25abc4a	Test device	testing	camera	\N	\N	172.18.3.203	\N	\N	\N	offline	{"role": "entry", "brand": "prama_hikvision", "channel": 1, "rtspUrl": null, "httpPort": 80, "rtspPort": 554, "fpsTarget": 8, "resolution": "1280x720", "rtspMainUrl": null, "snapshotUrl": null, "rtspPassword": "Mli@Frs!2026", "rtspUsername": "admin", "recognitionMode": "face"}	["face_detection", "rtsp_stream"]	\N	\N	\N	2026-03-23 06:57:52.225466+00	2026-03-23 06:57:52.225466+00	MIXED
9d52ca98-68d9-4cb5-bade-d6aa9d432156	entrance-cam-01	Main Entrance Camera	camera	\N	Main entrance door, Building A ground floor	172.18.3.201	\N	\N	\N	online	{"rtspUrl": "rtsp://admin:PASS@172.18.3.201:554/Streaming/Channels/102"}	["face_detection", "face_enrollment"]	\N	\N	\N	2026-03-19 10:57:18.917153+00	2026-03-24 05:49:23.643883+00	MIXED
\.


--
-- Data for Name: employee_face_embeddings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_face_embeddings (id, employee_id, embedding, model_version, quality_score, is_primary, enrolled_by, enrolled_at) FROM stdin;
1a71ebba-74ac-484d-8419-b75b8fc080aa	47	[0.0026603965,-0.047958083,0.052944425,0.046660822,0.006283603,-0.05193094,0.0012396182,0.0018800136,0.00045100055,-0.007454178,-0.014462423,0.027060034,0.01397595,0.08095714,0.037985396,0.05391737,-0.07872747,0.0030809925,0.015597525,-0.077065356,0.029087003,-0.021161554,0.0068359524,0.018719057,-0.04106639,-0.028458642,-0.028032979,0.013155027,-0.036911104,-0.026837068,-0.004859658,-0.036140855,0.0017381258,0.011786824,0.025519537,-0.03628274,-0.072200626,0.033444986,0.0143813435,0.049133725,0.01853663,-0.0007854504,0.07280872,-0.039911017,-0.050349906,0.06822777,-0.07698428,0.06328197,0.05403899,0.028154597,-0.0033368974,0.06190363,0.052903887,-0.009851068,0.019732542,0.040863693,0.018506225,-0.10978063,0.044633854,-0.087402895,0.10329433,-0.011685476,0.03458009,0.0046417587,0.05071476,-0.032553118,0.036505707,-0.0494175,0.05525517,-0.06984934,-0.041370433,-0.0061569177,-0.024141198,-0.015759682,-0.056998365,0.045363564,0.04244473,-0.040052906,0.074916765,-0.00012462691,-0.043904144,-0.098835,-0.06952503,0.02853972,-0.029391048,0.012871252,0.11472643,-0.009506484,0.0064609633,-0.045201406,0.08513269,0.086673185,0.016185345,0.004355449,-0.05655243,0.09518646,-0.014634714,0.08983526,-0.05578218,0.022154769,0.05574164,-0.04816078,-0.023269601,0.0002467201,-0.02205342,0.048566174,-0.0028554923,0.03261393,0.02801271,0.0704169,0.036221933,0.03520845,-0.03235042,-0.03200584,0.048485093,0.021789914,-0.015496177,-0.053755213,-0.030282915,0.030424802,0.00049407367,0.03399227,-0.04698514,-0.030870736,0.03970832,0.0020117667,0.027708665,-0.0022575366,-0.012486128,0.003937387,-0.009450742,-0.024323625,-0.06311981,0.05780915,-0.048606712,-0.004489736,0.026999224,0.030100487,0.04556626,0.0148576815,0.0058326027,-0.05464708,-0.0009697779,0.019783216,-0.023674997,-0.012161813,-0.031235589,0.032877434,-0.043336593,0.013874602,-0.13191514,0.01796908,0.008411921,0.0146043105,-0.045728415,0.05983612,0.06936287,-0.06174147,0.034053076,-0.024445243,0.124942355,0.0033901054,0.036201663,-0.022256117,-0.009775057,-0.041796096,-0.008665292,-0.055052474,0.0090605505,-0.0071957395,-0.009004809,0.067781836,0.0038056339,0.019266339,0.015384694,0.04031641,0.038431328,-0.05136339,0.009055483,0.012111139,-0.025154684,0.015719144,0.09178115,0.032715276,-0.076132946,-0.036830023,0.04224203,-0.04730945,0.075119466,0.034661166,-0.00436305,0.07240333,0.0317626,0.04682298,0.024465514,-0.053674135,-0.0011275014,-0.04439062,-0.0149691645,0.021729106,-0.025904661,-0.029938329,-0.043417674,-0.026087089,0.038451597,0.044350076,0.025235761,-0.004803916,-0.049133725,-0.11156436,-0.027080303,0.019367687,-0.0020092328,-0.019692002,-0.059025332,-0.027830282,-0.017249504,-0.09413243,-0.03656652,0.019448766,-0.0022119298,0.015040109,-0.03689083,0.03253285,0.0039475216,-0.0652684,0.010570643,0.0002563799,0.024303356,0.02793163,-0.038877264,-0.07252494,0.017675169,0.018881215,0.030343723,-0.02592493,-0.043701448,0.027810013,0.039323196,0.049458038,0.02018861,-0.05918749,-0.06575487,0.031803142,0.05403899,0.07929502,0.023269601,0.013337455,0.10726719,-0.011290216,0.050552603,0.05440384,0.016428582,0.09170007,0.038877264,0.046620283,-0.0058984794,0.1156183,-0.022154769,0.07629511,0.008959202,-0.058701016,0.08975418,0.043782525,0.0035547966,0.017715707,-0.025560077,-0.017168425,-0.05262011,0.015141457,-0.024262818,-0.051728245,0.021323713,-0.033404447,0.02665464,0.06741698,-0.037863776,-0.03514764,0.05707944,-0.03966778,0.07678158,0.045728415,-0.08456514,0.09534861,0.016732628,0.026573561,8.250397e-05,0.008548741,-0.017735977,-0.031640984,-0.045931112,0.07138984,-0.023229063,0.011168598,0.058376703,-0.02150614,0.03460036,0.072970875,0.023512838,-0.022337196,0.016641414,0.021060206,-0.034194965,0.05063368,-0.011553722,0.04151232,0.034701705,-0.04471493,-0.026837068,-0.0469446,-0.005655243,-0.022337196,-0.022843938,-0.046295967,0.036242202,0.06040367,0.020746026,-0.020664947,0.057565916,-0.027100572,0.07840315,-0.060363133,-0.036586788,0.023715535,-0.07199793,-0.0056501757,-0.02464794,-0.06701159,-0.036161125,-0.010312204,0.0062531987,0.005049686,0.043701448,0.060768526,0.05707944,-0.011584126,-0.009911877,-0.049052645,0.07844369,-0.026897876,0.03717461,-0.012871252,-0.0331004,-0.04880941,-0.02732354,-0.04289066,0.032796357,-0.060160436,-0.05934965,-0.006364682,0.0077531557,0.04499871,0.016185345,-0.021769645,0.00065116375,-0.04037722,-0.0033470322,0.0113003515,-0.0146043105,0.060606368,0.07961933,0.0069930423,-0.03910023,-0.0033444986,0.028093789,0.029087003,-0.09194331,-0.048525635,0.019965643,0.016144807,0.021769645,0.09210546,-0.059552345,-0.031073432,0.03447874,0.023330411,0.02600601,-0.045120325,-0.03839079,-0.08221386,0.007129863,-0.0125874765,0.00016453286,0.03893807,0.05257957,0.030951815,0.0036865496,0.07738967,-0.0742276,0.043174434,0.06543055,0.019864295,0.0061163786,-0.013185432,-0.00811801,0.017320449,-0.076903194,-0.09226762,-0.025620885,-0.041005578,0.04812024,-0.059511803,0.05849832,0.072970875,0.052295797,-0.005629906,-0.05906587,-0.052944425,0.027505968,0.0011775421,0.02789109,0.0015202266,0.0033039593,0.03125586,0.027728934,-0.010362878,-0.0035623978,0.0391205,-0.013418534,-0.07252494,0.029938329,-0.0032152792,0.024364166,0.016357638,0.027749203,-0.022823669,0.009617967,0.09397028,0.009253113,0.06178201,-0.03770162,-0.01558739,-0.016225886,-0.034377392,-0.043863606,0.04625543,0.019590653,0.0016025723,-0.029005924,-0.018901484,-0.08845692,0.019661598,-0.036931373,0.00634948,-0.026573561,0.050349906,-0.041431244,0.047349993,0.11326702,-0.028357293,-0.043214977,-0.04755269,-0.007945717,0.031559903,0.09583508,-0.047349993,-0.011371295,0.050552603,0.03460036,-0.019327147,-0.050349906,0.0010274198,0.062106326,0.031681523,-0.07005204,-0.00462909,-0.042363647,-0.03628274,-0.019033236,-0.0035218582,-0.02343176,-0.09607832,-0.047714844,0.014756333,0.008989607,-0.058741555,0.07094391,-0.049701277,-0.010530103,0.04739053,0.05525517,-0.025641156,-0.036911104,-0.06474138,-0.003559864,-0.007976122,0.015516446,0.007971055,0.009050416,0.056957822,0.030445071,0.046417587,0.009090955,0.024830367,0.053714674,-0.05934965,-0.064092755,-0.01910418,0.003995662,-0.07897071,0.05201202,-0.0026350594,0.019235933,0.07033582,-0.05801185,0.024870908,0.06271441,0.013043544,-0.05602542,0.009724383,-0.05910641,-0.005042085]	arcface-r50-fp16	0.6123098134994507	t	1	2026-03-24 05:50:45.963879+00
f18a8594-c2b3-4ac2-b3f9-7285b2584f91	46	[-0.036666807,-0.017155314,-0.0013922872,0.050940186,0.031000296,0.052926384,-0.04439741,-0.0081103165,0.02989036,-0.04700673,0.009478263,-0.038867205,-0.0412818,0.010709901,0.032207593,0.102815054,0.019229142,-0.071035855,-0.01272531,0.0023354888,0.003736295,0.036881007,-0.012472167,0.010855946,-0.01612327,-0.007321678,0.033570673,0.00951234,0.017632391,-0.06507725,-0.01024256,0.03470008,0.02895568,-0.04805825,0.005291665,0.014536257,-0.06640139,0.0107585825,0.050200228,0.07917538,0.028118359,0.014497312,0.032889135,0.010651484,-0.04116497,-0.029909834,-0.02469119,-0.029559327,0.037036788,-0.021361385,0.0702959,0.09603861,-0.018868899,-0.08155103,-0.019277822,0.01991068,-0.045643654,-0.025976378,0.022529738,-0.052459043,-0.051485416,0.023892816,-0.034641664,0.11652373,-0.0025630742,-0.031954452,0.08404352,0.007608898,0.027027898,0.024749609,-0.019355712,-0.058145028,-0.0045419717,-0.045955215,-0.04630572,0.0022515133,0.042255428,-0.018547602,-0.020017779,-0.06737502,0.06215637,-0.020446176,0.022763409,-0.027397875,-0.003938323,-0.039918724,0.02850781,0.00021663209,0.021108242,0.07177581,0.0054961266,0.056197774,0.030747153,0.018596284,-0.06756974,-0.027183676,-0.041827034,0.088015914,-0.0078084916,0.031350803,-0.0007819445,0.05012234,-0.031545527,0.07002328,0.049888667,0.014234433,-0.0004944202,0.094792366,0.0007314376,0.03927613,-0.0087675145,0.03775727,0.06749185,0.078162804,-0.0663235,-0.019034415,0.025859544,-0.09946577,0.026716337,0.03337595,0.008168734,-0.046734117,0.0069516995,0.09642806,-0.05097913,0.04143758,0.028605172,0.039159294,-0.0817847,-0.06749185,-0.06940016,-0.036803115,-0.06488253,0.0062312153,0.060715403,-0.040152393,-0.008392668,-0.030961351,0.05273166,-0.027826272,0.0068494687,0.070140116,0.029754054,0.042683825,-0.01016467,-0.053705286,0.016142743,0.019852262,-0.0367447,-0.022743937,-0.034446936,0.011810101,-0.05775558,-0.03094188,-0.00091520976,-0.043073278,-0.049460273,-0.05280955,-0.008407272,0.10032257,0.052069593,0.044825807,-0.00012847318,-0.015139906,0.06597299,-0.015169115,-0.038419336,0.034427464,-0.03216865,0.0114303855,0.023561783,-0.06441519,-0.03658892,0.05448419,-0.013874191,0.021926088,0.07613766,-0.030980824,-0.004585785,-0.07298311,-0.023834398,-0.03224654,-0.05685984,-0.039042458,-0.009278669,-0.031000296,0.04241121,-0.014361004,0.103516065,0.047746688,-0.035498455,0.022023452,0.056353554,0.029734582,-0.004982538,0.01881048,0.035478983,-0.012004826,0.07921433,-0.03995767,-0.0069809086,0.0010125726,0.01711637,-0.078980654,0.030766625,-0.06947805,0.020913517,0.043073278,-0.033414893,-0.01593828,0.028079415,0.047668796,-0.021556111,0.022510266,0.012939508,-0.008090843,-0.027066842,0.0004941159,-0.0026044534,0.030825043,0.06313,-0.025723236,-0.044163737,0.0038604327,-0.010943572,0.048097193,-0.0058758412,0.0073995683,-0.015003598,-0.023055498,0.009794692,0.0107585825,-0.0327723,-0.0015468505,0.102114044,0.018313931,0.041242857,0.008090843,-0.019579647,-0.0186547,0.07574821,-0.10195826,0.0952597,-0.042450156,-0.003234877,-0.04322906,0.020757737,0.055457816,-0.061572198,-0.00084036216,0.03935402,-0.0150814885,0.01654193,-0.0323439,0.00023777806,0.06386996,0.039548744,0.046578337,0.03995767,-0.015665665,-0.036725227,-0.007915591,-0.072944164,0.06807603,0.09152097,0.02506117,0.007818228,-0.0375236,-0.027300512,-0.053861067,-0.047045674,-0.0046369005,-0.022899717,-0.024243323,-0.037017312,-0.0038993778,-0.11395335,0.07718918,0.022101343,-0.04319011,-0.045799434,-0.0016770732,-0.021302968,-0.0325581,-0.027534183,0.03734835,0.055652544,0.06313,-0.013981289,-0.0075796894,-0.15048385,0.056820896,-0.04478686,0.015665665,-0.0076527116,0.007993481,0.005520467,0.08918427,0.053627398,0.04790247,0.020621428,-0.06009228,-0.025314312,0.026015325,-0.017135842,0.031565,0.002124942,0.020777209,0.02911146,-0.045448925,-0.020855099,-0.037990943,-0.07111374,0.002060439,0.00433751,-0.06394785,0.060325954,-0.0698675,-0.023016552,-0.1707353,0.021906616,-0.12026246,-0.016035642,-0.032110233,-0.05074546,0.05939127,0.020056725,-0.0265995,-0.07282733,-0.045721542,0.00411601,-0.04868137,0.05218643,0.045059476,-0.024808027,0.019375185,0.030455066,0.020095669,0.059508108,0.02798205,0.02453541,0.022042925,0.03392118,0.0583787,0.047357235,-0.029656691,-0.029286712,0.03713415,0.030357702,0.022120815,-0.07072429,0.046072047,-0.021984506,0.0038336578,0.0045590103,0.028001525,-0.009896923,-0.023737036,-0.0424891,-0.048252974,-0.021575583,0.022841299,-0.017379249,0.017788172,0.025255894,0.079292215,-0.045955215,0.022685518,0.05981967,0.019307032,-0.0048170215,0.0067326333,0.026950007,0.021283494,0.049732886,0.015305423,0.0047172247,-0.0018413728,-0.053393725,-0.052614823,0.0023172332,-0.014380476,-0.059157602,-0.07422935,-0.08186259,0.03699784,0.02437963,-0.0019107438,-0.11473225,-0.055925157,0.002984168,0.007871778,-0.0025338654,0.012034034,0.024048597,0.01635694,0.013397113,0.0014835647,0.029870888,-0.07220421,0.014117598,-0.027573127,-0.0030498877,0.025470093,-0.05510731,-0.0048510986,0.0026117554,-0.013689201,0.010310714,0.009736274,0.014818609,-0.007750074,-0.0027553656,0.06289633,0.0053452146,-0.055146255,0.02903357,-0.044903696,0.00825636,-0.09728485,-0.041671254,0.03187656,0.09237777,0.0013971553,-0.075164035,0.06971172,-0.045877323,0.067725524,-0.012754519,-0.012267705,-0.034018543,0.058106083,-0.007321678,-0.102114044,0.025879016,-0.018304195,0.12579267,0.12664945,-0.106242225,0.03232443,0.011323286,0.050940186,-0.04256699,0.025041698,-0.037114676,0.06733607,0.043579563,-0.043073278,-0.04677306,-0.05997545,-0.0032957287,-0.10265927,-0.002945223,-0.014662828,0.03691995,-0.029364603,-0.008397536,-0.0066644796,0.053666342,-0.03483639,-0.002483967,-0.02545062,0.043735344,0.021497693,-0.05510731,-0.022977607,-0.0405029,-0.027105786,0.03127291,-0.04836981,-0.009395504,0.008139525,-0.07193159,0.009911527,-0.010593066,-0.07298311,0.062390044,0.019579647,0.051251747,0.019764636,0.040775515,-0.029169876,-0.06219532,-0.014536257,0.016444568,0.033434365,0.011001989,0.048876096,0.020134615,0.01314397,0.024126487,0.029150404,0.069945395,0.02537273,0.009551285,-0.015217796,0.02048512,-0.047668796,0.045215257,0.00611438,0.022880243,-0.07652711,-0.02330864,0.06363629,0.036705755,-0.015266478,-0.019511493,-0.020699318,-0.017671337,-0.042294376,-0.016405622,-0.010515176]	arcface-r50-fp16	0.6406351923942566	t	1	2026-03-24 05:52:42.864448+00
7f3205ee-f042-40f6-9af8-8ba7f058dc98	2	[0.00089861517,-0.08580162,0.050226327,-0.0059899245,-0.05123814,0.029383007,-0.05868507,0.058482707,0.083211385,-0.048769318,0.03705254,-0.042050887,-0.14222023,-0.03140663,0.021895602,0.021490877,0.013436858,0.005418251,0.038307186,-0.004107955,0.053018924,0.017656112,-0.0060506333,-0.01004223,-0.057673257,0.06706287,0.01836438,0.050388217,-0.0032352675,-0.029463952,-0.035413403,0.019032175,-0.0030253166,0.035716947,-0.031224504,0.0015417478,-0.018050719,-0.045086324,-0.022624107,0.03156852,0.019396428,0.028310487,0.0066476017,0.042779393,0.052492782,0.06350129,-0.013173787,0.020904027,0.08539689,0.022361035,-0.071433894,0.022320563,-0.024829855,0.039015453,0.08912036,-0.018344143,0.02497151,-0.0061872276,-0.0007019443,0.02727844,0.022624107,-0.021551587,0.028735448,-0.066212945,-0.044924434,0.012576818,0.05475924,-0.06475594,0.00050306006,0.010441896,-0.06544397,-0.03367309,-0.03672876,-0.058442235,0.032195844,-0.08167343,0.038347658,-0.020043988,0.004760573,-0.009784218,0.014934339,0.0670224,0.019305365,0.070462555,0.032944586,0.019993396,0.07159579,0.009961285,0.02760222,0.0745098,-0.029524662,0.008772406,-0.016482411,0.09761958,-0.08693485,0.042941283,-0.028006943,-0.001482304,-0.020883791,0.04698853,0.003812,-0.020721901,0.053180814,0.03290411,0.02737962,-0.060506333,0.012445282,-0.06277279,0.05386885,0.048243176,0.045733884,-0.007780831,0.067184284,0.04852648,0.060223024,0.033308838,0.0008790113,0.09211533,0.045329157,0.03345049,0.029504426,-0.012951188,-0.04617908,0.04852648,-0.016502647,0.005489078,0.0024017878,0.07904272,-0.009531265,0.03318742,-0.033814743,-0.057309005,0.019770797,0.026165446,0.10093832,-0.02561907,-0.020762373,-0.021612294,0.035109863,0.013952881,0.023474028,-0.022259854,0.06427027,0.0012824711,0.0059646294,-0.019831507,0.020499302,0.07232429,-0.0318923,-0.073417045,-0.050873887,-0.01788883,-0.024566785,-0.010011875,0.039055925,-0.0072445706,-0.010998392,-0.03780128,0.045288686,0.043426953,0.09381517,-0.05192617,0.049376406,-0.022866942,0.07301232,0.01282977,-0.05018585,0.09057737,-0.0015493365,-0.009419966,0.017939419,-0.018010246,-0.066212945,0.037356082,-0.017949536,-0.06690098,0.057997037,0.032337498,-0.023818044,0.0388738,0.03699183,-0.021571822,0.04885026,0.045733884,0.056782864,-0.039663013,-0.0502668,-0.084182724,0.02319072,0.0041003665,0.08895847,0.057470895,-0.03521104,0.07042208,-0.046462387,-0.008888764,-0.031426866,-0.009495852,-0.027055841,-0.0034173934,-0.06471547,-0.0115548875,-0.023433555,-0.0526142,0.030334111,0.045329157,-0.030738834,-0.0028254837,-0.015834851,-0.060020663,0.053666484,0.020256467,0.09211533,0.0004692276,0.03464443,0.046786167,-0.047069475,0.0011243756,0.030354347,-0.021025443,-0.068924606,0.04617908,-0.0065363026,-0.05127861,0.07677626,0.012222684,-0.0570257,0.03705254,-0.02588214,-0.01326485,-0.07062445,0.030415056,-0.021936074,0.020823082,0.07969028,0.0076796496,0.053787902,0.047797978,-0.03302553,-0.015278354,0.0026762416,-0.03221608,0.045167267,-0.0037310552,-0.004183841,-0.008220969,-0.070543505,0.04929546,-0.08013547,-0.0037867047,-0.017585285,0.03559553,-0.084101774,0.0115548875,0.08604445,-0.039217815,-0.017686466,-0.020549893,0.045774356,-0.0016176337,0.05010491,-0.029888913,0.053828374,0.008246264,0.011625715,-0.04787892,-0.019517845,-0.041767582,-0.022725288,0.018030481,0.016715126,0.045936245,-0.042738922,-0.1261122,0.048566956,-0.026752297,0.007583528,-0.0002991168,-0.027298676,-0.003602049,-0.10547124,-0.04097837,0.0018427618,0.015652725,-0.08984887,-0.027237967,0.025416706,-0.021146862,-0.0025497652,-0.008064138,-0.04069506,-0.015875323,0.044964906,0.13056417,0.0021576881,-0.0332886,-0.07944744,-0.0029823147,0.055973414,0.010988274,0.0009688096,0.01906253,-0.0034831613,0.049214516,0.021956312,-0.06382507,0.015237882,0.013194023,0.032398205,-0.038104825,-0.011443589,-0.019780915,-0.058725543,0.023474028,0.087096736,0.0530594,-0.009920812,-0.006561598,0.0037082892,-0.06394649,0.015662843,-0.03205419,-0.036748994,0.036647815,-0.05370696,0.06507972,-0.039278526,0.02614521,-0.029180646,0.10093832,0.019942805,0.010937683,0.039541595,0.03806435,0.06912696,0.008843233,0.017979892,0.02582143,-0.0031239681,0.031831592,0.022745524,-0.0019262362,-0.022077728,0.0054536643,-0.0007259748,-0.08580162,0.030253166,-0.03891427,0.016553236,-0.0046568625,0.045167267,-0.058604125,-0.0004448809,0.06512019,-0.04804081,0.033470728,0.058199402,-0.011787605,0.0017782588,-0.030617418,0.044803016,-0.00633394,-0.020883791,-0.056944754,-0.029524662,0.05475924,0.05556869,0.0072951615,0.00671337,-0.047109947,0.029767497,-0.07090776,-0.03614191,0.051885698,0.011443589,-0.056459084,-0.083130434,-0.010998392,-0.057228062,0.036202617,-0.046786167,0.057794675,-0.0924391,0.054152153,-0.028796157,-0.03776081,-0.0027116549,-0.00058558595,0.09543407,-0.057673257,0.04504585,-0.02561907,0.0542331,0.026934424,0.04832412,0.04682664,0.0072192755,-0.06568681,-0.03361238,0.05374743,0.034745608,0.14230117,0.016603827,0.013578511,-0.013416621,0.0057217944,0.06196334,0.0038423543,-0.031042378,0.0026813005,0.06394649,0.0700983,-0.07268854,-0.017747175,-0.028998518,-0.06487735,0.016907372,0.05475924,0.05050963,0.039582066,-0.028452141,0.008534631,0.031386394,-0.036324035,0.061032474,-0.005220948,0.05326176,-0.028472377,0.08725863,-0.0718791,-0.020984972,-0.023069303,-0.01299166,-0.087096736,-0.08183532,0.004816223,0.02523458,0.0040067737,0.071433894,-0.02727844,0.06969358,-0.01976068,-0.010027053,0.033571906,0.096567295,-0.021571822,-0.038469076,-0.03656687,0.07289091,-0.02561907,0.0742265,-0.031224504,-0.01820249,-0.0458553,-0.024769146,-0.06677956,0.026064266,-0.09761958,0.07042208,-0.0102951825,-0.059130266,-0.045612466,0.10223344,0.0023436085,-0.02018564,-0.017099615,-0.04800034,0.032620806,0.017554931,-0.03209466,-0.04130215,0.006991618,0.009576797,-0.02754151,0.011089454,-0.059534993,0.03537293,0.0028811335,0.057389952,0.023554973,0.019153593,0.0717172,0.0087926425,0.022401508,-0.034381356,0.006556539,-0.02958537,0.007426697,0.0018528799,0.07608823,0.01588544,-0.02442513,0.019022057,-0.0015126583,-0.0765739,-0.024850091,0.01772694,-0.0027900704,-0.005524491,0.017099615,-0.065605864,-0.022624107,-0.05868507,0.03640498,0.02835096,0.004773221,-0.0045657996,0.011453707,0.014772449,-0.010826384,-0.007775772,-0.037234664]	arcface-r50-fp16	0.6876306533813477	t	1	2026-03-24 05:58:11.825075+00
\.


--
-- Data for Name: facility_device; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.facility_device (pk_device_id, tenant_id, customer_id, site_id, unit_id, external_device_id, name, location_label, ip_address, status, recognition_accuracy, total_scans, error_rate, model, last_active) FROM stdin;
17	1	1	1	\N	jetson-orin-01	Jetson Orin NX - Edge AI	Server Room / Edge Node	172.18.3.202/32	offline	0.00	0	0.00	NVIDIA Jetson Orin NX 16GB	2026-03-23 04:08:28.10915+00
15	1	1	1	\N	entrance-cam-01	Main Entrance Camera	Floor 7 - Main Entrance	172.18.3.201/32	online	96.80	8700	0.00	Prama IP Camera	2026-03-24 06:04:07.936229+00
\.


--
-- Data for Name: frs_customer; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.frs_customer (pk_customer_id, customer_name, fk_tenant_id) FROM stdin;
1	North America Ops	1
\.


--
-- Data for Name: frs_customer_user_map; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.frs_customer_user_map (fk_user_id, fk_customer_id) FROM stdin;
1	1
2	1
\.


--
-- Data for Name: frs_site; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.frs_site (pk_site_id, site_name, fk_customer_id) FROM stdin;
1	Dallas Campus	1
\.


--
-- Data for Name: frs_tenant; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.frs_tenant (pk_tenant_id, tenant_name) FROM stdin;
1	Motivity Global
\.


--
-- Data for Name: frs_tenant_user_map; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.frs_tenant_user_map (fk_user_id, fk_tenant_id) FROM stdin;
1	1
2	1
13	1
\.


--
-- Data for Name: frs_unit; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.frs_unit (pk_unit_id, unit_name, fk_site_id) FROM stdin;
1	HR Operations	1
\.


--
-- Data for Name: frs_user; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.frs_user (pk_user_id, email, username, fk_user_type_id, role, password_hash, department, created_at, keycloak_sub, auth_provider, last_identity_sync_at) FROM stdin;
13	sahil@company.com	sahil	1	hr	$2a$10$7px.kedbQ5Oq1k38AX85aeZ3FwpUk/lb5mUKL024Epq9L0LZjzqcK	Human Resource	2026-03-19 12:30:41.967785+00	0335aee7-97a4-4c88-bfd8-687041c9b961	internal	\N
2	hr@company.com	HR Manager	2	hr	$2a$10$4qLnSPwJimkuXyCB8aeZHeY0.IQvXFly.cTIEDEsaU7hUi.nplF/C	Human Resources	2026-03-19 10:48:35.694809+00	4b7f959d-0909-438c-9087-f458de0027c1	internal	\N
1	admin@company.com	Admin User	1	admin	$2a$10$BxhgsvKD4GGtGCkSy6.uJOnaAsBEAvR6lxAF6q2STBxe.nN8ehk1C	IT	2026-03-19 10:48:35.694809+00	b0dae712-f417-40ee-9546-c98c084c03e7	internal	\N
\.


--
-- Data for Name: frs_user_membership; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.frs_user_membership (pk_membership_id, fk_user_id, role, tenant_id, customer_id, site_id, unit_id, permissions) FROM stdin;
16	1	admin	1	1	1	\N	{users.read,users.manage,users.write,devices.read,devices.manage,devices.write,attendance.read,attendance.manage,attendance.write,analytics.read,audit.read,facility.read,facility.manage,aiinsights.read}
13	13	hr	1	1	1	\N	{users.read,users.write,attendance.read,attendance.manage,attendance.write,analytics.read,devices.read,facility.read,aiinsights.read}
17	2	hr	1	1	1	\N	{users.read,users.write,attendance.read,attendance.manage,attendance.write,analytics.read,devices.read,facility.read,aiinsights.read}
\.


--
-- Data for Name: hr_department; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.hr_department (pk_department_id, tenant_id, name, code, color) FROM stdin;
1	1	Engineering	ENG	#3B82F6
2	1	Human Resources	HR	#EC4899
3	1	Sales	SAL	#10B981
\.


--
-- Data for Name: hr_employee; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.hr_employee (pk_employee_id, tenant_id, customer_id, site_id, unit_id, fk_department_id, fk_shift_id, employee_code, full_name, email, position_title, location_label, status, join_date, phone_number, created_at, face_enrolled) FROM stdin;
5	1	1	1	\N	1	1	ML005	Anjali Bypureddy	Anjali@company.com	Associate Data Scientist	Floor 7	active	2026-03-23	7894561230	2026-03-23 12:43:57.340577+00	f
47	1	1	1	\N	2	2	ML004	Sai Dinesh	Dinesh@company.com	AI/ML Engineer	Floor 7	active	2026-03-23	7531598624	2026-03-23 05:50:13.545583+00	t
44	1	1	1	\N	1	2	ML001	yeshwanth	yeshwanth.mudimala@motivitylabs.com	Associate Data Scientist	Floor 7	active	2026-03-17	1234567890	2026-03-20 11:19:44.178127+00	f
46	1	1	1	\N	1	1	ML003	Karthik	karthik@company.com	Associate Data Scientist	Floor 7	active	2026-03-20	\N	2026-03-20 12:44:27.431175+00	t
2	1	1	1	\N	3	1	ML002	ramalinga	ramalinga@motivitylabs.com	Team Lead	Floor 7	active	2026-03-02	9876543210	2026-03-20 11:45:39.189292+00	t
\.


--
-- Data for Name: hr_leave_request; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.hr_leave_request (pk_leave_id, tenant_id, fk_employee_id, leave_type, start_date, end_date, days, reason, status, approved_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: hr_shift; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.hr_shift (pk_shift_id, tenant_id, name, shift_type, start_time, end_time, grace_period_minutes, is_flexible) FROM stdin;
1	1	Morning Shift	morning	08:00:00	17:00:00	10	f
2	1	Evening Shift	evening	14:00:00	23:00:00	15	f
3	1	Flexible Hours	flexible	\N	\N	0	t
\.


--
-- Data for Name: system_alert; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.system_alert (pk_alert_id, tenant_id, customer_id, site_id, unit_id, alert_type, severity, title, message, fk_employee_id, fk_device_id, is_read, created_at) FROM stdin;
2	1	1	1	1	late-checkin	medium	Multiple Late Check-ins	5 employees checked in late today	\N	\N	t	2026-03-19 10:48:35.694809+00
\.


--
-- Name: attendance_events_pk_attendance_event_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_events_pk_attendance_event_id_seq', 1, false);


--
-- Name: attendance_record_pk_attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_record_pk_attendance_id_seq', 1726, true);


--
-- Name: audit_log_pk_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_log_pk_audit_id_seq', 983, true);


--
-- Name: facility_device_pk_device_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.facility_device_pk_device_id_seq', 17, true);


--
-- Name: frs_customer_pk_customer_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.frs_customer_pk_customer_id_seq', 7, true);


--
-- Name: frs_site_pk_site_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.frs_site_pk_site_id_seq', 7, true);


--
-- Name: frs_tenant_pk_tenant_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.frs_tenant_pk_tenant_id_seq', 7, true);


--
-- Name: frs_unit_pk_unit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.frs_unit_pk_unit_id_seq', 7, true);


--
-- Name: frs_user_membership_pk_membership_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.frs_user_membership_pk_membership_id_seq', 22, true);


--
-- Name: frs_user_pk_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.frs_user_pk_user_id_seq', 20, true);


--
-- Name: hr_department_pk_department_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.hr_department_pk_department_id_seq', 26, true);


--
-- Name: hr_employee_pk_employee_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.hr_employee_pk_employee_id_seq', 48, true);


--
-- Name: hr_leave_request_pk_leave_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.hr_leave_request_pk_leave_id_seq', 5, true);


--
-- Name: hr_shift_pk_shift_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.hr_shift_pk_shift_id_seq', 26, true);


--
-- Name: system_alert_pk_alert_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.system_alert_pk_alert_id_seq', 21, true);


--
-- Name: attendance_events attendance_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_events
    ADD CONSTRAINT attendance_events_pkey PRIMARY KEY (pk_attendance_event_id);


--
-- Name: attendance_record attendance_record_emp_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_record
    ADD CONSTRAINT attendance_record_emp_date_key UNIQUE (fk_employee_id, attendance_date);


--
-- Name: attendance_record attendance_record_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_record
    ADD CONSTRAINT attendance_record_pkey PRIMARY KEY (pk_attendance_id);


--
-- Name: attendance_record attendance_record_tenant_id_fk_employee_id_attendance_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_record
    ADD CONSTRAINT attendance_record_tenant_id_fk_employee_id_attendance_date_key UNIQUE (tenant_id, fk_employee_id, attendance_date);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (pk_audit_id);


--
-- Name: auth_session_token auth_session_token_access_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_session_token
    ADD CONSTRAINT auth_session_token_access_token_key UNIQUE (access_token);


--
-- Name: auth_session_token auth_session_token_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_session_token
    ADD CONSTRAINT auth_session_token_pkey PRIMARY KEY (token_id);


--
-- Name: auth_session_token auth_session_token_refresh_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_session_token
    ADD CONSTRAINT auth_session_token_refresh_token_key UNIQUE (refresh_token);


--
-- Name: device_events device_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_events
    ADD CONSTRAINT device_events_pkey PRIMARY KEY (pk_event_id);


--
-- Name: devices devices_device_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_device_code_key UNIQUE (device_code);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (pk_device_id);


--
-- Name: employee_face_embeddings employee_face_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_face_embeddings
    ADD CONSTRAINT employee_face_embeddings_pkey PRIMARY KEY (id);


--
-- Name: facility_device facility_device_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_device
    ADD CONSTRAINT facility_device_pkey PRIMARY KEY (pk_device_id);


--
-- Name: facility_device facility_device_tenant_id_external_device_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_device
    ADD CONSTRAINT facility_device_tenant_id_external_device_id_key UNIQUE (tenant_id, external_device_id);


--
-- Name: frs_customer frs_customer_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_customer
    ADD CONSTRAINT frs_customer_pkey PRIMARY KEY (pk_customer_id);


--
-- Name: frs_customer_user_map frs_customer_user_map_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_customer_user_map
    ADD CONSTRAINT frs_customer_user_map_pkey PRIMARY KEY (fk_user_id, fk_customer_id);


--
-- Name: frs_site frs_site_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_site
    ADD CONSTRAINT frs_site_pkey PRIMARY KEY (pk_site_id);


--
-- Name: frs_tenant frs_tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_tenant
    ADD CONSTRAINT frs_tenant_pkey PRIMARY KEY (pk_tenant_id);


--
-- Name: frs_tenant_user_map frs_tenant_user_map_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_tenant_user_map
    ADD CONSTRAINT frs_tenant_user_map_pkey PRIMARY KEY (fk_user_id, fk_tenant_id);


--
-- Name: frs_unit frs_unit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_unit
    ADD CONSTRAINT frs_unit_pkey PRIMARY KEY (pk_unit_id);


--
-- Name: frs_user frs_user_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user
    ADD CONSTRAINT frs_user_email_key UNIQUE (email);


--
-- Name: frs_user frs_user_keycloak_sub_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user
    ADD CONSTRAINT frs_user_keycloak_sub_key UNIQUE (keycloak_sub);


--
-- Name: frs_user_membership frs_user_membership_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user_membership
    ADD CONSTRAINT frs_user_membership_pkey PRIMARY KEY (pk_membership_id);


--
-- Name: frs_user frs_user_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user
    ADD CONSTRAINT frs_user_pkey PRIMARY KEY (pk_user_id);


--
-- Name: hr_department hr_department_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_department
    ADD CONSTRAINT hr_department_pkey PRIMARY KEY (pk_department_id);


--
-- Name: hr_department hr_department_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_department
    ADD CONSTRAINT hr_department_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: hr_employee hr_employee_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_employee
    ADD CONSTRAINT hr_employee_pkey PRIMARY KEY (pk_employee_id);


--
-- Name: hr_employee hr_employee_tenant_id_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_employee
    ADD CONSTRAINT hr_employee_tenant_id_email_key UNIQUE (tenant_id, email);


--
-- Name: hr_employee hr_employee_tenant_id_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_employee
    ADD CONSTRAINT hr_employee_tenant_id_employee_code_key UNIQUE (tenant_id, employee_code);


--
-- Name: hr_leave_request hr_leave_request_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_leave_request
    ADD CONSTRAINT hr_leave_request_pkey PRIMARY KEY (pk_leave_id);


--
-- Name: hr_shift hr_shift_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_shift
    ADD CONSTRAINT hr_shift_pkey PRIMARY KEY (pk_shift_id);


--
-- Name: system_alert system_alert_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_alert
    ADD CONSTRAINT system_alert_pkey PRIMARY KEY (pk_alert_id);


--
-- Name: idx_alert_scope_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alert_scope_created ON public.system_alert USING btree (tenant_id, site_id, created_at DESC);


--
-- Name: idx_attendance_employee_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_employee_date ON public.attendance_record USING btree (fk_employee_id, attendance_date DESC);


--
-- Name: idx_attendance_scope_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_scope_date ON public.attendance_record USING btree (tenant_id, site_id, attendance_date DESC);


--
-- Name: idx_audit_scope_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_scope_created ON public.audit_log USING btree (tenant_id, created_at DESC);


--
-- Name: idx_auth_session_token_access; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_auth_session_token_access ON public.auth_session_token USING btree (access_token);


--
-- Name: idx_auth_session_token_refresh; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_auth_session_token_refresh ON public.auth_session_token USING btree (refresh_token);


--
-- Name: idx_device_events_device_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_device_events_device_time ON public.device_events USING btree (fk_device_id, occurred_at DESC);


--
-- Name: idx_device_events_type_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_device_events_type_time ON public.device_events USING btree (event_type, occurred_at DESC);


--
-- Name: idx_device_events_unprocessed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_device_events_unprocessed ON public.device_events USING btree (processing_status);


--
-- Name: idx_device_scope_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_device_scope_status ON public.facility_device USING btree (tenant_id, site_id, status);


--
-- Name: idx_devices_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_code ON public.devices USING btree (device_code);


--
-- Name: idx_devices_heartbeat; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_heartbeat ON public.devices USING btree (last_heartbeat_at);


--
-- Name: idx_devices_site; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_site ON public.devices USING btree (fk_site_id);


--
-- Name: idx_devices_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_status ON public.devices USING btree (status);


--
-- Name: idx_employee_face_hnsw; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_face_hnsw ON public.employee_face_embeddings USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_employee_scope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_scope ON public.hr_employee USING btree (tenant_id, customer_id, site_id, unit_id);


--
-- Name: idx_frs_user_keycloak_sub; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_frs_user_keycloak_sub ON public.frs_user USING btree (keycloak_sub);


--
-- Name: idx_membership_scope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_membership_scope ON public.frs_user_membership USING btree (tenant_id, customer_id, site_id, unit_id);


--
-- Name: idx_membership_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_membership_user ON public.frs_user_membership USING btree (fk_user_id);


--
-- Name: idx_shift_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_shift_tenant ON public.hr_shift USING btree (tenant_id);


--
-- Name: uq_membership_user_scope_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_membership_user_scope_role ON public.frs_user_membership USING btree (fk_user_id, role, tenant_id, customer_id, site_id, unit_id);


--
-- Name: employee_face_embeddings trg_sync_face_enrolled; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_face_enrolled AFTER INSERT OR DELETE ON public.employee_face_embeddings FOR EACH ROW EXECUTE FUNCTION public.sync_face_enrolled();


--
-- Name: devices update_devices_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: attendance_events attendance_events_fk_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_events
    ADD CONSTRAINT attendance_events_fk_employee_id_fkey FOREIGN KEY (fk_employee_id) REFERENCES public.hr_employee(pk_employee_id);


--
-- Name: attendance_events attendance_events_fk_original_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_events
    ADD CONSTRAINT attendance_events_fk_original_event_id_fkey FOREIGN KEY (fk_original_event_id) REFERENCES public.device_events(pk_event_id);


--
-- Name: attendance_events attendance_events_fk_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_events
    ADD CONSTRAINT attendance_events_fk_shift_id_fkey FOREIGN KEY (fk_shift_id) REFERENCES public.hr_shift(pk_shift_id);


--
-- Name: attendance_record attendance_record_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_record
    ADD CONSTRAINT attendance_record_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.frs_customer(pk_customer_id);


--
-- Name: attendance_record attendance_record_fk_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_record
    ADD CONSTRAINT attendance_record_fk_employee_id_fkey FOREIGN KEY (fk_employee_id) REFERENCES public.hr_employee(pk_employee_id);


--
-- Name: attendance_record attendance_record_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_record
    ADD CONSTRAINT attendance_record_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.frs_site(pk_site_id);


--
-- Name: attendance_record attendance_record_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_record
    ADD CONSTRAINT attendance_record_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: attendance_record attendance_record_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_record
    ADD CONSTRAINT attendance_record_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.frs_unit(pk_unit_id);


--
-- Name: audit_log audit_log_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.frs_customer(pk_customer_id);


--
-- Name: audit_log audit_log_fk_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_fk_user_id_fkey FOREIGN KEY (fk_user_id) REFERENCES public.frs_user(pk_user_id);


--
-- Name: audit_log audit_log_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.frs_site(pk_site_id);


--
-- Name: audit_log audit_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: audit_log audit_log_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.frs_unit(pk_unit_id);


--
-- Name: auth_session_token auth_session_token_fk_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_session_token
    ADD CONSTRAINT auth_session_token_fk_user_id_fkey FOREIGN KEY (fk_user_id) REFERENCES public.frs_user(pk_user_id);


--
-- Name: employee_face_embeddings employee_face_embeddings_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_face_embeddings
    ADD CONSTRAINT employee_face_embeddings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.hr_employee(pk_employee_id) ON DELETE CASCADE;


--
-- Name: employee_face_embeddings employee_face_embeddings_enrolled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_face_embeddings
    ADD CONSTRAINT employee_face_embeddings_enrolled_by_fkey FOREIGN KEY (enrolled_by) REFERENCES public.frs_user(pk_user_id);


--
-- Name: facility_device facility_device_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_device
    ADD CONSTRAINT facility_device_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.frs_customer(pk_customer_id);


--
-- Name: facility_device facility_device_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_device
    ADD CONSTRAINT facility_device_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.frs_site(pk_site_id);


--
-- Name: facility_device facility_device_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_device
    ADD CONSTRAINT facility_device_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: facility_device facility_device_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.facility_device
    ADD CONSTRAINT facility_device_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.frs_unit(pk_unit_id);


--
-- Name: frs_customer frs_customer_fk_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_customer
    ADD CONSTRAINT frs_customer_fk_tenant_id_fkey FOREIGN KEY (fk_tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: frs_customer_user_map frs_customer_user_map_fk_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_customer_user_map
    ADD CONSTRAINT frs_customer_user_map_fk_customer_id_fkey FOREIGN KEY (fk_customer_id) REFERENCES public.frs_customer(pk_customer_id);


--
-- Name: frs_customer_user_map frs_customer_user_map_fk_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_customer_user_map
    ADD CONSTRAINT frs_customer_user_map_fk_user_id_fkey FOREIGN KEY (fk_user_id) REFERENCES public.frs_user(pk_user_id);


--
-- Name: frs_site frs_site_fk_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_site
    ADD CONSTRAINT frs_site_fk_customer_id_fkey FOREIGN KEY (fk_customer_id) REFERENCES public.frs_customer(pk_customer_id);


--
-- Name: frs_tenant_user_map frs_tenant_user_map_fk_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_tenant_user_map
    ADD CONSTRAINT frs_tenant_user_map_fk_tenant_id_fkey FOREIGN KEY (fk_tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: frs_tenant_user_map frs_tenant_user_map_fk_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_tenant_user_map
    ADD CONSTRAINT frs_tenant_user_map_fk_user_id_fkey FOREIGN KEY (fk_user_id) REFERENCES public.frs_user(pk_user_id);


--
-- Name: frs_unit frs_unit_fk_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_unit
    ADD CONSTRAINT frs_unit_fk_site_id_fkey FOREIGN KEY (fk_site_id) REFERENCES public.frs_site(pk_site_id);


--
-- Name: frs_user_membership frs_user_membership_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user_membership
    ADD CONSTRAINT frs_user_membership_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.frs_customer(pk_customer_id);


--
-- Name: frs_user_membership frs_user_membership_fk_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user_membership
    ADD CONSTRAINT frs_user_membership_fk_user_id_fkey FOREIGN KEY (fk_user_id) REFERENCES public.frs_user(pk_user_id);


--
-- Name: frs_user_membership frs_user_membership_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user_membership
    ADD CONSTRAINT frs_user_membership_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.frs_site(pk_site_id);


--
-- Name: frs_user_membership frs_user_membership_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user_membership
    ADD CONSTRAINT frs_user_membership_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: frs_user_membership frs_user_membership_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.frs_user_membership
    ADD CONSTRAINT frs_user_membership_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.frs_unit(pk_unit_id);


--
-- Name: hr_department hr_department_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_department
    ADD CONSTRAINT hr_department_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: hr_employee hr_employee_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_employee
    ADD CONSTRAINT hr_employee_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.frs_customer(pk_customer_id);


--
-- Name: hr_employee hr_employee_fk_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_employee
    ADD CONSTRAINT hr_employee_fk_department_id_fkey FOREIGN KEY (fk_department_id) REFERENCES public.hr_department(pk_department_id);


--
-- Name: hr_employee hr_employee_fk_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_employee
    ADD CONSTRAINT hr_employee_fk_shift_id_fkey FOREIGN KEY (fk_shift_id) REFERENCES public.hr_shift(pk_shift_id);


--
-- Name: hr_employee hr_employee_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_employee
    ADD CONSTRAINT hr_employee_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.frs_site(pk_site_id);


--
-- Name: hr_employee hr_employee_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_employee
    ADD CONSTRAINT hr_employee_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: hr_employee hr_employee_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_employee
    ADD CONSTRAINT hr_employee_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.frs_unit(pk_unit_id);


--
-- Name: hr_leave_request hr_leave_request_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_leave_request
    ADD CONSTRAINT hr_leave_request_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.frs_user(pk_user_id);


--
-- Name: hr_leave_request hr_leave_request_fk_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_leave_request
    ADD CONSTRAINT hr_leave_request_fk_employee_id_fkey FOREIGN KEY (fk_employee_id) REFERENCES public.hr_employee(pk_employee_id);


--
-- Name: hr_leave_request hr_leave_request_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_leave_request
    ADD CONSTRAINT hr_leave_request_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: hr_shift hr_shift_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_shift
    ADD CONSTRAINT hr_shift_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: system_alert system_alert_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_alert
    ADD CONSTRAINT system_alert_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.frs_customer(pk_customer_id);


--
-- Name: system_alert system_alert_fk_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_alert
    ADD CONSTRAINT system_alert_fk_device_id_fkey FOREIGN KEY (fk_device_id) REFERENCES public.facility_device(pk_device_id);


--
-- Name: system_alert system_alert_fk_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_alert
    ADD CONSTRAINT system_alert_fk_employee_id_fkey FOREIGN KEY (fk_employee_id) REFERENCES public.hr_employee(pk_employee_id);


--
-- Name: system_alert system_alert_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_alert
    ADD CONSTRAINT system_alert_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.frs_site(pk_site_id);


--
-- Name: system_alert system_alert_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_alert
    ADD CONSTRAINT system_alert_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.frs_tenant(pk_tenant_id);


--
-- Name: system_alert system_alert_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_alert
    ADD CONSTRAINT system_alert_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.frs_unit(pk_unit_id);


--
-- PostgreSQL database dump complete
--

