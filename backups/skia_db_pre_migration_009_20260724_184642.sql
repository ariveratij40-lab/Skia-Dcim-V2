--
-- PostgreSQL database dump
--

\restrict xhzf5L6v7j0pRJTeYqv3yFaBWzFoi3E1hWvUnzSqrjXByPXaGYjU8h502CtbD8D

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

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
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: skia_user
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO skia_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_chat_history; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.ai_chat_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid,
    user_id uuid,
    user_message text,
    assistant_message text,
    model character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ai_chat_history OWNER TO skia_user;

--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    key_hash character varying(500) NOT NULL,
    key_prefix character varying(20) NOT NULL,
    created_by uuid,
    last_used timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.api_keys OWNER TO skia_user;

--
-- Name: asset_types; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.asset_types (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    icon character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.asset_types OWNER TO skia_user;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.assets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    asset_type_id uuid NOT NULL,
    location_id uuid,
    internal_code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    serial_number character varying(255),
    model character varying(255),
    manufacturer character varying(255),
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    rfid_tag character varying(255),
    install_year smallint,
    observations text,
    specs jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT assets_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'maintenance'::character varying, 'decommissioned'::character varying, 'unknown'::character varying])::text[])))
);


ALTER TABLE public.assets OWNER TO skia_user;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    tenant_id uuid,
    action character varying(255) NOT NULL,
    entity_type character varying(100),
    entity_id character varying(255),
    changes jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.audit_logs OWNER TO skia_user;

--
-- Name: backbone_links; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.backbone_links (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    link_type character varying(50) DEFAULT 'fiber'::character varying,
    origin_id uuid,
    destination_id uuid,
    cable_length_m numeric(8,2),
    fiber_count smallint,
    bandwidth_gbps numeric(6,2),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.backbone_links OWNER TO skia_user;

--
-- Name: branches; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.branches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    city character varying(255),
    status character varying(50) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.branches OWNER TO skia_user;

--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.feature_flags (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    enabled boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.feature_flags OWNER TO skia_user;

--
-- Name: integrators; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.integrators (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(300) NOT NULL,
    contact_name character varying(200),
    email character varying(300),
    phone character varying(50),
    specialties jsonb DEFAULT '[]'::jsonb,
    rating integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT integrators_rating_check CHECK (((rating >= 0) AND (rating <= 5)))
);


ALTER TABLE public.integrators OWNER TO skia_user;

--
-- Name: locations; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.locations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    floor character varying(50),
    room character varying(100),
    zone character varying(100),
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.locations OWNER TO skia_user;

--
-- Name: mdf_idf; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.mdf_idf (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    type character varying(10) NOT NULL,
    rack_count smallint DEFAULT 0,
    patch_panel_count smallint DEFAULT 0,
    switch_count smallint DEFAULT 0,
    ups_count smallint DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT mdf_idf_type_check CHECK (((type)::text = ANY ((ARRAY['MDF'::character varying, 'IDF'::character varying])::text[])))
);


ALTER TABLE public.mdf_idf OWNER TO skia_user;

--
-- Name: nodes; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.nodes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    node_type character varying(50) DEFAULT 'endpoint'::character varying,
    ip_address character varying(45),
    mac_address character varying(17),
    connected_switch_id uuid,
    switch_port character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.nodes OWNER TO skia_user;

--
-- Name: patch_panels; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.patch_panels (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    rack_id uuid,
    port_count smallint DEFAULT 24 NOT NULL,
    port_type character varying(50) DEFAULT 'RJ45'::character varying,
    rack_unit smallint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.patch_panels OWNER TO skia_user;

--
-- Name: pdus; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.pdus (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    rack_id uuid,
    outlet_count smallint DEFAULT 8,
    amperage numeric(5,2),
    management_ip character varying(45),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.pdus OWNER TO skia_user;

--
-- Name: permissions; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.permissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    module character varying(100),
    is_global boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.permissions OWNER TO skia_user;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.projects (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(300) NOT NULL,
    description text,
    status character varying(50) DEFAULT 'active'::character varying,
    responsible character varying(200),
    start_date date,
    modules jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.projects OWNER TO skia_user;

--
-- Name: racks; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.racks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    total_u smallint DEFAULT 42 NOT NULL,
    used_u smallint DEFAULT 0 NOT NULL,
    height_mm integer,
    width_mm integer,
    depth_mm integer,
    power_kw numeric(6,2),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.racks OWNER TO skia_user;

--
-- Name: rfid_readers; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.rfid_readers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    location character varying(300),
    ip_address character varying(50),
    status character varying(50) DEFAULT 'offline'::character varying,
    last_seen timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.rfid_readers OWNER TO skia_user;

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.role_permissions OWNER TO skia_user;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid,
    name character varying(255) NOT NULL,
    description text,
    is_global boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.roles OWNER TO skia_user;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.schema_migrations (
    version character varying(100) NOT NULL,
    applied_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.schema_migrations OWNER TO skia_user;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid,
    branch_id uuid,
    token character varying(255) NOT NULL,
    expires_at bigint NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.sessions OWNER TO skia_user;

--
-- Name: sidebar_module_permissions; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.sidebar_module_permissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sidebar_module_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.sidebar_module_permissions OWNER TO skia_user;

--
-- Name: sidebar_modules; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.sidebar_modules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    icon character varying(100),
    path character varying(255),
    order_index integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.sidebar_modules OWNER TO skia_user;

--
-- Name: switches; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.switches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    rack_id uuid,
    port_count smallint DEFAULT 24 NOT NULL,
    uplink_count smallint DEFAULT 2,
    management_ip character varying(45),
    vlan_config jsonb,
    rack_unit smallint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.switches OWNER TO skia_user;

--
-- Name: tenant_config; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.tenant_config (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    section character varying(100) NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by uuid
);


ALTER TABLE public.tenant_config OWNER TO skia_user;

--
-- Name: tenant_feature_flags; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.tenant_feature_flags (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    feature_flag_id uuid NOT NULL,
    enabled boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tenant_feature_flags OWNER TO skia_user;

--
-- Name: tenant_integrations; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.tenant_integrations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_code character varying(100) NOT NULL,
    name character varying(200) NOT NULL,
    status character varying(50) DEFAULT 'disconnected'::character varying,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tenant_integrations OWNER TO skia_user;

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.tenants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    logo character varying(512),
    status character varying(50) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tenants OWNER TO skia_user;

--
-- Name: ups; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.ups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    capacity_kva numeric(6,2),
    battery_runtime_min smallint,
    management_ip character varying(45),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ups OWNER TO skia_user;

--
-- Name: user_branches; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.user_branches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_branches OWNER TO skia_user;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_roles OWNER TO skia_user;

--
-- Name: user_tenants; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.user_tenants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_tenants OWNER TO skia_user;

--
-- Name: users; Type: TABLE; Schema: public; Owner: skia_user
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO skia_user;

--
-- Data for Name: ai_chat_history; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.ai_chat_history (id, tenant_id, user_id, user_message, assistant_message, model, created_at) FROM stdin;
\.


--
-- Data for Name: api_keys; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.api_keys (id, tenant_id, name, key_hash, key_prefix, created_by, last_used, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: asset_types; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.asset_types (id, code, name, description, icon, created_at, updated_at) FROM stdin;
a0000000-0000-0000-0000-000000000001	MDF	Main Distribution Frame	Cuarto de distribución principal	Building2	2026-05-18 14:58:07.852353	2026-05-18 14:58:07.852353
a0000000-0000-0000-0000-000000000002	IDF	Intermediate Distribution Frame	Cuarto de distribución intermedio	Building	2026-05-18 14:58:07.852353	2026-05-18 14:58:07.852353
a0000000-0000-0000-0000-000000000003	RACK	Rack de Equipos	Rack de montaje para equipos	Grid3x3	2026-05-18 14:58:07.852353	2026-05-18 14:58:07.852353
a0000000-0000-0000-0000-000000000004	SWITCH	Switch de Red	Switch de capa 2 o capa 3	Network	2026-05-18 14:58:07.852353	2026-05-18 14:58:07.852353
a0000000-0000-0000-0000-000000000005	UPS	Sistema de Alimentación Ininterrumpida	UPS para protección eléctrica	Zap	2026-05-18 14:58:07.852353	2026-05-18 14:58:07.852353
a0000000-0000-0000-0000-000000000006	PDU	Unidad de Distribución de Energía	PDU para distribución de energía en rack	Plug	2026-05-18 14:58:07.852353	2026-05-18 14:58:07.852353
a0000000-0000-0000-0000-000000000007	PATCH_PANEL	Patch Panel	Panel de parcheo de cableado estructurado	LayoutGrid	2026-05-18 14:58:07.852353	2026-05-18 14:58:07.852353
a0000000-0000-0000-0000-000000000008	NODE	Nodo de Red	Dispositivo terminal de red	Monitor	2026-05-18 14:58:07.852353	2026-05-18 14:58:07.852353
a0000000-0000-0000-0000-000000000009	BACKBONE	Enlace Backbone	Enlace de backbone entre MDFs/IDFs	GitBranch	2026-05-18 14:58:07.852353	2026-05-18 14:58:07.852353
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.assets (id, tenant_id, branch_id, asset_type_id, location_id, internal_code, name, serial_number, model, manufacturer, status, rfid_tag, install_year, observations, specs, created_by, updated_by, created_at, updated_at) FROM stdin;
c0000000-0000-0000-0000-000000000001	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000001	b0000000-0000-0000-0000-000000000001	MDF-001	MDF Principal Miami	\N	\N	\N	active	\N	2022	Cuarto de distribución principal. Contiene 2 racks, 2 switches core y 1 UPS.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000002	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000002	b0000000-0000-0000-0000-000000000002	IDF-001	IDF Piso 1	\N	\N	\N	active	\N	2022	Cuarto de distribución piso 1. Conectado al MDF por fibra OM4.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000003	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000002	b0000000-0000-0000-0000-000000000003	IDF-002	IDF Piso 2	\N	\N	\N	active	\N	2022	Cuarto de distribución piso 2. Conectado al MDF por fibra OM4.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000004	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000003	b0000000-0000-0000-0000-000000000001	RACK-001	Rack A1 - MDF Principal	\N	\N	\N	active	\N	2022	Rack principal en MDF. 42U, actualmente 18U ocupados.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000005	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000003	b0000000-0000-0000-0000-000000000001	RACK-002	Rack A2 - MDF Principal	\N	\N	\N	active	\N	2022	Rack secundario en MDF. 42U, actualmente 10U ocupados.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000006	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000004	b0000000-0000-0000-0000-000000000001	SW-001	Switch Core 1 - MDF	\N	\N	\N	active	\N	2022	Switch core Cisco Catalyst 9300. 48 puertos GbE + 4 uplinks 10G.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000007	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000004	b0000000-0000-0000-0000-000000000002	SW-002	Switch Acceso Piso 1	\N	\N	\N	active	\N	2022	Switch de acceso HP Aruba 2930F. 24 puertos GbE + 4 uplinks SFP.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000008	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000005	b0000000-0000-0000-0000-000000000001	UPS-001	UPS Principal MDF	\N	\N	\N	active	\N	2022	APC Smart-UPS 3000VA. Autonomía estimada 20 minutos a carga completa.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000009	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000007	b0000000-0000-0000-0000-000000000001	PP-001	Patch Panel 24P - Rack A1	\N	\N	\N	active	\N	2022	Patch panel Cat6A 24 puertos. Conectado al switch core 1.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000010	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000008	b0000000-0000-0000-0000-000000000002	NODE-001	Workstation Recepción	\N	\N	\N	active	\N	2023	PC de recepción. Conectado al switch piso 1, puerto 1.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000011	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000008	b0000000-0000-0000-0000-000000000002	NODE-002	Workstation Oficina 101	\N	\N	\N	active	\N	2023	PC oficina 101. Conectado al switch piso 1, puerto 2.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000012	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000008	b0000000-0000-0000-0000-000000000002	NODE-003	IP Phone Recepción	\N	\N	\N	active	\N	2023	Teléfono IP Cisco 7941. Conectado al switch piso 1, puerto 3.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000013	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000008	b0000000-0000-0000-0000-000000000003	NODE-004	Workstation Oficina 201	\N	\N	\N	active	\N	2023	PC oficina 201. Conectado al IDF piso 2.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000014	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000008	b0000000-0000-0000-0000-000000000003	NODE-005	Cámara IP Pasillo 2	\N	\N	\N	active	\N	2023	Cámara IP Hikvision. Conectada al IDF piso 2.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
c0000000-0000-0000-0000-000000000015	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	a0000000-0000-0000-0000-000000000009	b0000000-0000-0000-0000-000000000001	BB-001	Backbone MDF → IDF Piso 1	\N	\N	\N	active	\N	2022	Enlace de fibra OM4 multimodo entre MDF y IDF Piso 1. 12 fibras, 45 metros.	\N	550e8400-e29b-41d4-a716-446655440101	\N	2026-05-18 14:58:07.858621	2026-05-18 14:58:07.858621
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.audit_logs (id, user_id, tenant_id, action, entity_type, entity_id, changes, ip_address, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: backbone_links; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.backbone_links (id, asset_id, tenant_id, branch_id, link_type, origin_id, destination_id, cable_length_m, fiber_count, bandwidth_gbps, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.branches (id, tenant_id, name, city, status, created_at, updated_at) FROM stdin;
550e8400-e29b-41d4-a716-446655440201	550e8400-e29b-41d4-a716-446655440001	Sede Principal - Miami	Miami, FL	active	2026-05-18 13:14:22.243203	2026-05-18 13:14:22.243203
550e8400-e29b-41d4-a716-446655440202	550e8400-e29b-41d4-a716-446655440001	Centro de Datos - Nueva York	Nueva York, NY	active	2026-05-18 13:14:22.243203	2026-05-18 13:14:22.243203
550e8400-e29b-41d4-a716-446655440203	550e8400-e29b-41d4-a716-446655440001	Oficina Regional - Texas	Dallas, TX	active	2026-05-18 13:14:22.243203	2026-05-18 13:14:22.243203
550e8400-e29b-41d4-a716-446655440002	550e8400-e29b-41d4-a716-446655440001	Test Branch	Test City	active	2026-07-24 18:12:00.200354	2026-07-24 18:12:00.200354
\.


--
-- Data for Name: feature_flags; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.feature_flags (id, code, name, description, enabled, created_at, updated_at) FROM stdin;
550e8400-e29b-41d4-a716-446655440601	dcim_module	DCIM Module	Módulo DCIM	t	2026-05-18 13:14:22.25739	2026-05-18 13:14:22.25739
550e8400-e29b-41d4-a716-446655440602	cmdb_module	CMDB Module	Módulo CMDB	t	2026-05-18 13:14:22.25739	2026-05-18 13:14:22.25739
550e8400-e29b-41d4-a716-446655440603	monitoring_module	Monitoring Module	Módulo de Monitoreo	f	2026-05-18 13:14:22.25739	2026-05-18 13:14:22.25739
\.


--
-- Data for Name: integrators; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.integrators (id, tenant_id, name, contact_name, email, phone, specialties, rating, created_at) FROM stdin;
\.


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.locations (id, tenant_id, branch_id, name, floor, room, zone, description, created_at, updated_at) FROM stdin;
b0000000-0000-0000-0000-000000000001	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	Cuarto MDF Principal	Planta Baja	MDF-01	Zona Técnica	Cuarto de distribución principal del edificio	2026-05-18 14:58:07.855125	2026-05-18 14:58:07.855125
b0000000-0000-0000-0000-000000000002	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	Cuarto IDF Piso 1	Piso 1	IDF-01	Zona Técnica	Cuarto de distribución intermedio del primer piso	2026-05-18 14:58:07.855125	2026-05-18 14:58:07.855125
b0000000-0000-0000-0000-000000000003	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	Cuarto IDF Piso 2	Piso 2	IDF-02	Zona Técnica	Cuarto de distribución intermedio del segundo piso	2026-05-18 14:58:07.855125	2026-05-18 14:58:07.855125
\.


--
-- Data for Name: mdf_idf; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.mdf_idf (id, asset_id, tenant_id, branch_id, type, rack_count, patch_panel_count, switch_count, ups_count, created_at, updated_at) FROM stdin;
e0000000-0000-0000-0000-000000000001	c0000000-0000-0000-0000-000000000001	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	MDF	2	1	2	1	2026-05-18 14:58:07.868728	2026-05-18 14:58:07.868728
e0000000-0000-0000-0000-000000000002	c0000000-0000-0000-0000-000000000002	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	IDF	0	0	1	0	2026-05-18 14:58:07.868728	2026-05-18 14:58:07.868728
e0000000-0000-0000-0000-000000000003	c0000000-0000-0000-0000-000000000003	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	IDF	0	0	0	0	2026-05-18 14:58:07.868728	2026-05-18 14:58:07.868728
\.


--
-- Data for Name: nodes; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.nodes (id, asset_id, tenant_id, branch_id, node_type, ip_address, mac_address, connected_switch_id, switch_port, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: patch_panels; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.patch_panels (id, asset_id, tenant_id, branch_id, rack_id, port_count, port_type, rack_unit, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: pdus; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.pdus (id, asset_id, tenant_id, branch_id, rack_id, outlet_count, amperage, management_ip, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.permissions (id, code, name, description, module, is_global, created_at) FROM stdin;
550e8400-e29b-41d4-a716-446655440401	dcim:view	Ver DCIM	Acceso a módulo DCIM	dcim	f	2026-05-18 13:14:22.248515
550e8400-e29b-41d4-a716-446655440402	dcim:asset:create	Crear Activos	Crear nuevos activos	dcim	f	2026-05-18 13:14:22.248515
550e8400-e29b-41d4-a716-446655440403	dcim:asset:edit	Editar Activos	Editar activos existentes	dcim	f	2026-05-18 13:14:22.248515
550e8400-e29b-41d4-a716-446655440404	dcim:asset:delete	Eliminar Activos	Eliminar activos	dcim	f	2026-05-18 13:14:22.248515
550e8400-e29b-41d4-a716-446655440405	admin:users	Gestionar Usuarios	Crear, editar, eliminar usuarios	admin	f	2026-05-18 13:14:22.248515
550e8400-e29b-41d4-a716-446655440406	admin:roles	Gestionar Roles	Crear, editar, eliminar roles	admin	f	2026-05-18 13:14:22.248515
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.projects (id, tenant_id, name, description, status, responsible, start_date, modules, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: racks; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.racks (id, asset_id, tenant_id, branch_id, total_u, used_u, height_mm, width_mm, depth_mm, power_kw, created_at, updated_at) FROM stdin;
d0000000-0000-0000-0000-000000000001	c0000000-0000-0000-0000-000000000004	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	42	18	2000	600	1000	3.50	2026-05-18 14:58:07.866384	2026-05-18 14:58:07.866384
d0000000-0000-0000-0000-000000000002	c0000000-0000-0000-0000-000000000005	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	42	10	2000	600	1000	2.00	2026-05-18 14:58:07.866384	2026-05-18 14:58:07.866384
\.


--
-- Data for Name: rfid_readers; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.rfid_readers (id, tenant_id, name, location, ip_address, status, last_seen, created_at) FROM stdin;
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.role_permissions (id, role_id, permission_id, created_at) FROM stdin;
515ce60b-73e9-47f1-9453-b83c432b07d8	550e8400-e29b-41d4-a716-446655440301	550e8400-e29b-41d4-a716-446655440401	2026-05-18 13:14:22.249758
b040e472-9ffc-4fa0-98b8-606459d6fe7c	550e8400-e29b-41d4-a716-446655440301	550e8400-e29b-41d4-a716-446655440402	2026-05-18 13:14:22.249758
f8870bcf-d1fb-4d54-9340-e5ec13d4b8fc	550e8400-e29b-41d4-a716-446655440301	550e8400-e29b-41d4-a716-446655440403	2026-05-18 13:14:22.249758
d9a1d068-83f4-4d92-9585-cc699db52ccf	550e8400-e29b-41d4-a716-446655440301	550e8400-e29b-41d4-a716-446655440404	2026-05-18 13:14:22.249758
b5d84fc5-53fe-4220-9a85-1ce2e6006273	550e8400-e29b-41d4-a716-446655440301	550e8400-e29b-41d4-a716-446655440405	2026-05-18 13:14:22.249758
c5b2fc6e-1b2a-4674-8ce0-91298ac736fa	550e8400-e29b-41d4-a716-446655440301	550e8400-e29b-41d4-a716-446655440406	2026-05-18 13:14:22.249758
b663b39f-376d-455f-802d-1f49b36f3636	550e8400-e29b-41d4-a716-446655440302	550e8400-e29b-41d4-a716-446655440401	2026-05-18 13:14:22.249758
59d62c34-2d10-48b9-ab82-8404e07614b3	550e8400-e29b-41d4-a716-446655440302	550e8400-e29b-41d4-a716-446655440402	2026-05-18 13:14:22.249758
1d8fe472-bdd2-40ed-a11e-d6c4f31bab62	550e8400-e29b-41d4-a716-446655440302	550e8400-e29b-41d4-a716-446655440403	2026-05-18 13:14:22.249758
4a6da4f3-a65b-4c20-ae64-71cff95ffa0d	550e8400-e29b-41d4-a716-446655440303	550e8400-e29b-41d4-a716-446655440401	2026-05-18 13:14:22.249758
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.roles (id, tenant_id, name, description, is_global, created_at) FROM stdin;
550e8400-e29b-41d4-a716-446655440301	550e8400-e29b-41d4-a716-446655440001	admin	Administrador del Tenant	f	2026-05-18 13:14:22.247049
550e8400-e29b-41d4-a716-446655440302	550e8400-e29b-41d4-a716-446655440001	operator	Operador de Infraestructura	f	2026-05-18 13:14:22.247049
550e8400-e29b-41d4-a716-446655440303	550e8400-e29b-41d4-a716-446655440001	viewer	Visualizador de Solo Lectura	f	2026-05-18 13:14:22.247049
550e8400-e29b-41d4-a716-446655440304	\N	super_admin	Super Administrador Global	t	2026-05-18 13:14:22.247049
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.schema_migrations (version, applied_at) FROM stdin;
006_config_admin_schema	2026-07-24 18:05:17.033788
007_fix_password_hashes	2026-07-24 18:05:17.036092
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.sessions (id, user_id, tenant_id, branch_id, token, expires_at, created_at, updated_at) FROM stdin;
d08ae199-6eff-433a-8b56-f2c087b7a075	550e8400-e29b-41d4-a716-446655440101	\N	\N	piMHqu7iWOKEnKJZPNwTdaSRjizZGl4kGWSAKrM4tUY	1779198460	2026-05-18 13:47:40.245854	2026-05-18 13:47:40.245854
089cd6f0-e9b5-4547-885b-7ac9a104684e	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	DHsdGZhuOqlWoszmT2tRtzrTL2gBhN-WoBVvEc-IQOg	1779198564	2026-05-18 13:49:24.167397	2026-05-18 13:49:24.167397
1ca0f603-d736-442f-98f3-abe375599bb2	550e8400-e29b-41d4-a716-446655440101	\N	\N	uoa6MADrrxGrTBovTetR1njrjK5ibB_wMxXQuVGg5M4	1779198928	2026-05-18 13:55:28.423805	2026-05-18 13:55:28.423805
f6edb993-9c4c-41c5-b781-b4a83d1d39f3	550e8400-e29b-41d4-a716-446655440101	\N	\N	6mYL_l6z1SJfko_x5SfMnehYZs4pwuN8pJq6C9tNSdE	1779198946	2026-05-18 13:55:46.909569	2026-05-18 13:55:46.909569
22a04338-6cf0-4036-bdec-a8352f7767ac	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440001	\N	JL9Xm901oXRZM-rQq9N9pM6N_lhCQlvv_VQi1n68LYQ	1779199273	2026-05-18 14:01:13.408687	2026-05-18 14:01:13.408687
3dcbc7e7-1b18-4ed1-8e0b-20e1f3b88fd7	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	y3uW4Jee-7R89CWQfQslBz8A_G5IyRtwEw8rbqrakvE	1779199083	2026-05-18 13:58:03.323694	2026-05-18 13:58:03.323694
bee7f728-0d72-448f-ab49-efc0f75610dc	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440001	\N	q8VWdRCW4Miu09vMjlYfrqwdYvNJG7zK5Nkw85AuIkU	1779199646	2026-05-18 14:07:26.988248	2026-05-18 14:07:26.988248
9e4f0f64-6145-4891-a25c-b4dda90b48d1	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440001	\N	9EIZRKVlQOxakaHG-ppCINpTMbRVyqS-yRvAzQqAOhc	1779199893	2026-05-18 14:11:33.299916	2026-05-18 14:11:33.299916
ade06f5a-7ea2-4bd4-91b8-f13f53f1a103	550e8400-e29b-41d4-a716-446655440101	\N	\N	WH-eocOXrFR2yYG5PGkbq1_lvLetysVQHMSzIqlaju8	1779200885	2026-05-18 14:28:05.519434	2026-05-18 14:28:05.519434
cefbdb20-538a-4290-ac48-1dd129245acb	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	JyN4yNdHy0Wqn2jJe1_H7Jl5k3FfNu5oj89ICo90534	1779200922	2026-05-18 14:28:42.727287	2026-05-18 14:28:42.727287
abc059da-cd2a-407f-9cff-8fda17876fa4	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	h7_2und7fO2JBnK_qgAVnzWX60hb7FETbQ2N734RvGs	1779202894	2026-05-18 15:01:34.478351	2026-05-18 15:01:34.478351
5543f706-2d26-4787-a5a7-155b7a8838cc	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	T7uj0zwNkf_4b3wnJvSVm12dOOlVDt-sQnzHrJfosd8	1779208705	2026-05-18 16:38:25.345928	2026-05-18 16:38:25.345928
\.


--
-- Data for Name: sidebar_module_permissions; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.sidebar_module_permissions (id, sidebar_module_id, permission_id, created_at) FROM stdin;
24f6cba2-a12a-48fa-a94e-48a0d4efb22d	550e8400-e29b-41d4-a716-446655440501	550e8400-e29b-41d4-a716-446655440401	2026-05-18 13:14:22.255716
b0206e94-0fdd-4cad-9be7-3aed179c4902	550e8400-e29b-41d4-a716-446655440502	550e8400-e29b-41d4-a716-446655440401	2026-05-18 13:14:22.255716
7d80df21-4c41-45d3-98ea-f84dc789da59	550e8400-e29b-41d4-a716-446655440503	550e8400-e29b-41d4-a716-446655440405	2026-05-18 13:14:22.255716
\.


--
-- Data for Name: sidebar_modules; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.sidebar_modules (id, code, name, icon, path, order_index, created_at) FROM stdin;
550e8400-e29b-41d4-a716-446655440501	dashboard	Dashboard	LayoutDashboard	/dashboard	0	2026-05-18 13:14:22.254465
550e8400-e29b-41d4-a716-446655440502	infrastructure	Infraestructura	Building2	/infrastructure	1	2026-05-18 13:14:22.254465
550e8400-e29b-41d4-a716-446655440503	admin	Administración	Settings	/admin	99	2026-05-18 13:14:22.254465
\.


--
-- Data for Name: switches; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.switches (id, asset_id, tenant_id, branch_id, rack_id, port_count, uplink_count, management_ip, vlan_config, rack_unit, created_at, updated_at) FROM stdin;
f0000000-0000-0000-0000-000000000001	c0000000-0000-0000-0000-000000000006	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	d0000000-0000-0000-0000-000000000001	48	4	10.0.0.1	\N	1	2026-05-18 14:58:07.870978	2026-05-18 14:58:07.870978
f0000000-0000-0000-0000-000000000002	c0000000-0000-0000-0000-000000000007	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440201	\N	24	4	10.0.0.2	\N	1	2026-05-18 14:58:07.870978	2026-05-18 14:58:07.870978
\.


--
-- Data for Name: tenant_config; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.tenant_config (id, tenant_id, section, data, updated_at, updated_by) FROM stdin;
\.


--
-- Data for Name: tenant_feature_flags; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.tenant_feature_flags (id, tenant_id, feature_flag_id, enabled, created_at) FROM stdin;
cc0ee2d8-0242-40ca-89d5-25bcb95029a2	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440601	t	2026-05-18 13:14:22.258453
50148c99-19ac-4db3-8ae2-31525a77d42b	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440602	t	2026-05-18 13:14:22.258453
ab4efa45-e135-41b4-8215-cbb70351eac3	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440603	f	2026-05-18 13:14:22.258453
\.


--
-- Data for Name: tenant_integrations; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.tenant_integrations (id, tenant_id, integration_code, name, status, config, created_at, updated_at) FROM stdin;
67c2bd68-c021-4906-92a5-f4f40cba288d	550e8400-e29b-41d4-a716-446655440001	fluke	Fluke DSX	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
33d430ed-1124-4b0a-bb06-601606e0add5	550e8400-e29b-41d4-a716-446655440001	panduit	Panduit	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
990f6526-1da5-4071-be88-b338d7f5e9d9	550e8400-e29b-41d4-a716-446655440001	active_directory	Active Directory	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
9cc6c7d9-fb88-4dba-b2c5-7b39feeacfec	550e8400-e29b-41d4-a716-446655440001	slack	Slack	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
6368fb13-b905-496e-a78b-fc42db300c14	550e8400-e29b-41d4-a716-446655440001	jira	Jira	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
68be4f0a-31fd-44f8-b726-f707d759b5d7	550e8400-e29b-41d4-a716-446655440001	teams	Microsoft Teams	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
40e6647a-b4fa-42f6-9135-741b4beb743c	550e8400-e29b-41d4-a716-446655440002	fluke	Fluke DSX	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
0ab03d88-225f-4a43-87fd-2f80776333b0	550e8400-e29b-41d4-a716-446655440002	panduit	Panduit	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
1c445644-e786-4969-8826-b8445e3aef0c	550e8400-e29b-41d4-a716-446655440002	active_directory	Active Directory	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
d893a14b-066b-424d-ac1f-c04fcda40703	550e8400-e29b-41d4-a716-446655440002	slack	Slack	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
fac243e2-1e2a-4008-94c0-dd3e2e3cbe29	550e8400-e29b-41d4-a716-446655440002	jira	Jira	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
059179ae-13ce-46e4-885d-8819b3b7611d	550e8400-e29b-41d4-a716-446655440002	teams	Microsoft Teams	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
066ac382-60fd-4e34-9934-4457876a8077	550e8400-e29b-41d4-a716-446655440003	fluke	Fluke DSX	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
55d4f40d-1f50-4a5f-a8f7-bc6ac702072c	550e8400-e29b-41d4-a716-446655440003	panduit	Panduit	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
e383d33e-fbaa-47ff-b9c1-3b026cac4d11	550e8400-e29b-41d4-a716-446655440003	active_directory	Active Directory	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
16996ae6-659c-47b2-96fb-14fb25f87d0e	550e8400-e29b-41d4-a716-446655440003	slack	Slack	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
aebae200-326a-4dc3-a8c3-30ed5a4c2c5c	550e8400-e29b-41d4-a716-446655440003	jira	Jira	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
ac643287-f874-40df-9d5e-babb1ac88cac	550e8400-e29b-41d4-a716-446655440003	teams	Microsoft Teams	disconnected	{}	2026-07-24 18:05:16.97864	2026-07-24 18:05:16.97864
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.tenants (id, name, logo, status, created_at, updated_at) FROM stdin;
550e8400-e29b-41d4-a716-446655440001	ACME Corporation	/logos/acme.png	active	2026-05-18 13:14:22.235894	2026-05-18 13:14:22.235894
550e8400-e29b-41d4-a716-446655440002	Tech Solutions Inc	/logos/tech.png	active	2026-05-18 13:14:22.235894	2026-05-18 13:14:22.235894
550e8400-e29b-41d4-a716-446655440003	Global Infrastructure	/logos/global.png	active	2026-05-18 13:14:22.235894	2026-05-18 13:14:22.235894
\.


--
-- Data for Name: ups; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.ups (id, asset_id, tenant_id, branch_id, capacity_kva, battery_runtime_min, management_ip, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_branches; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.user_branches (id, user_id, branch_id, created_at) FROM stdin;
03d53f7e-abab-4481-8b9e-9314800bd703	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440201	2026-05-18 13:14:22.24468
70931a57-3a61-41c0-b444-d832d1e8e883	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440202	2026-05-18 13:14:22.24468
6e593d3f-982d-4d05-8216-3a67bbf20d34	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440203	2026-05-18 13:14:22.24468
1c1e4395-8dfb-45c2-bdea-b98d46a8a670	550e8400-e29b-41d4-a716-446655440102	550e8400-e29b-41d4-a716-446655440201	2026-05-18 13:14:22.24468
00f3baf5-38ea-4263-b9d9-3c677a130c2e	550e8400-e29b-41d4-a716-446655440102	550e8400-e29b-41d4-a716-446655440202	2026-05-18 13:14:22.24468
ffd9ee2c-a4f3-427a-ac94-e47e76f7e77b	550e8400-e29b-41d4-a716-446655440103	550e8400-e29b-41d4-a716-446655440201	2026-05-18 13:14:22.24468
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.user_roles (id, user_id, tenant_id, role_id, created_at) FROM stdin;
f7570fa2-9a70-4d66-993d-2f5ef96399e9	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440301	2026-05-18 13:14:22.252461
f1d29231-ff93-4600-8537-7d2dcbe7f38c	550e8400-e29b-41d4-a716-446655440102	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440302	2026-05-18 13:14:22.252461
e466cd8a-1dd3-4bbf-9dff-10e97e5750e9	550e8400-e29b-41d4-a716-446655440103	550e8400-e29b-41d4-a716-446655440001	550e8400-e29b-41d4-a716-446655440303	2026-05-18 13:14:22.252461
\.


--
-- Data for Name: user_tenants; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.user_tenants (id, user_id, tenant_id, created_at) FROM stdin;
1c43a7e0-2b42-4049-8468-e9ad3d62864b	550e8400-e29b-41d4-a716-446655440101	550e8400-e29b-41d4-a716-446655440001	2026-05-18 13:14:22.239992
f90787b8-0d33-41c8-b789-0b9021f1ffc3	550e8400-e29b-41d4-a716-446655440102	550e8400-e29b-41d4-a716-446655440001	2026-05-18 13:14:22.239992
b69962f3-6455-478f-a3f0-92f8caace3f9	550e8400-e29b-41d4-a716-446655440103	550e8400-e29b-41d4-a716-446655440001	2026-05-18 13:14:22.239992
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: skia_user
--

COPY public.users (id, email, name, password_hash, status, created_at, updated_at) FROM stdin;
550e8400-e29b-41d4-a716-446655440101	admin@acme.com	Admin User	$argon2id$v=19$m=65536,t=1,p=4$c2FsdHNhbHQ=$hash	active	2026-05-18 13:14:22.238347	2026-05-18 13:14:22.238347
550e8400-e29b-41d4-a716-446655440102	operator@acme.com	Operator User	$argon2id$v=19$m=65536,t=1,p=4$c2FsdHNhbHQ=$hash	active	2026-05-18 13:14:22.238347	2026-05-18 13:14:22.238347
550e8400-e29b-41d4-a716-446655440103	viewer@acme.com	Viewer User	$argon2id$v=19$m=65536,t=1,p=4$c2FsdHNhbHQ=$hash	active	2026-05-18 13:14:22.238347	2026-05-18 13:14:22.238347
550e8400-e29b-41d4-a716-446655440099	test@example.com	Test User	hash_placeholder	active	2026-07-24 18:12:00.197954	2026-07-24 18:12:00.197954
\.


--
-- Name: ai_chat_history ai_chat_history_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.ai_chat_history
    ADD CONSTRAINT ai_chat_history_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: asset_types asset_types_code_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.asset_types
    ADD CONSTRAINT asset_types_code_key UNIQUE (code);


--
-- Name: asset_types asset_types_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.asset_types
    ADD CONSTRAINT asset_types_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: assets assets_tenant_id_branch_id_internal_code_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_tenant_id_branch_id_internal_code_key UNIQUE (tenant_id, branch_id, internal_code);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: backbone_links backbone_links_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.backbone_links
    ADD CONSTRAINT backbone_links_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: feature_flags feature_flags_code_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_code_key UNIQUE (code);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);


--
-- Name: integrators integrators_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.integrators
    ADD CONSTRAINT integrators_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: mdf_idf mdf_idf_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.mdf_idf
    ADD CONSTRAINT mdf_idf_pkey PRIMARY KEY (id);


--
-- Name: nodes nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_pkey PRIMARY KEY (id);


--
-- Name: patch_panels patch_panels_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.patch_panels
    ADD CONSTRAINT patch_panels_pkey PRIMARY KEY (id);


--
-- Name: pdus pdus_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.pdus
    ADD CONSTRAINT pdus_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_code_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_code_key UNIQUE (code);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: racks racks_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.racks
    ADD CONSTRAINT racks_pkey PRIMARY KEY (id);


--
-- Name: rfid_readers rfid_readers_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.rfid_readers
    ADD CONSTRAINT rfid_readers_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_id_permission_id_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_permission_id_key UNIQUE (role_id, permission_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_key UNIQUE (token);


--
-- Name: sidebar_module_permissions sidebar_module_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.sidebar_module_permissions
    ADD CONSTRAINT sidebar_module_permissions_pkey PRIMARY KEY (id);


--
-- Name: sidebar_module_permissions sidebar_module_permissions_sidebar_module_id_permission_id_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.sidebar_module_permissions
    ADD CONSTRAINT sidebar_module_permissions_sidebar_module_id_permission_id_key UNIQUE (sidebar_module_id, permission_id);


--
-- Name: sidebar_modules sidebar_modules_code_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.sidebar_modules
    ADD CONSTRAINT sidebar_modules_code_key UNIQUE (code);


--
-- Name: sidebar_modules sidebar_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.sidebar_modules
    ADD CONSTRAINT sidebar_modules_pkey PRIMARY KEY (id);


--
-- Name: switches switches_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.switches
    ADD CONSTRAINT switches_pkey PRIMARY KEY (id);


--
-- Name: tenant_config tenant_config_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_config
    ADD CONSTRAINT tenant_config_pkey PRIMARY KEY (id);


--
-- Name: tenant_config tenant_config_tenant_id_section_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_config
    ADD CONSTRAINT tenant_config_tenant_id_section_key UNIQUE (tenant_id, section);


--
-- Name: tenant_feature_flags tenant_feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_feature_flags
    ADD CONSTRAINT tenant_feature_flags_pkey PRIMARY KEY (id);


--
-- Name: tenant_feature_flags tenant_feature_flags_tenant_id_feature_flag_id_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_feature_flags
    ADD CONSTRAINT tenant_feature_flags_tenant_id_feature_flag_id_key UNIQUE (tenant_id, feature_flag_id);


--
-- Name: tenant_integrations tenant_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_integrations
    ADD CONSTRAINT tenant_integrations_pkey PRIMARY KEY (id);


--
-- Name: tenant_integrations tenant_integrations_tenant_id_integration_code_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_integrations
    ADD CONSTRAINT tenant_integrations_tenant_id_integration_code_key UNIQUE (tenant_id, integration_code);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: ups ups_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.ups
    ADD CONSTRAINT ups_pkey PRIMARY KEY (id);


--
-- Name: user_branches user_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_branches
    ADD CONSTRAINT user_branches_pkey PRIMARY KEY (id);


--
-- Name: user_branches user_branches_user_id_branch_id_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_branches
    ADD CONSTRAINT user_branches_user_id_branch_id_key UNIQUE (user_id, branch_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_tenant_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_tenant_id_role_id_key UNIQUE (user_id, tenant_id, role_id);


--
-- Name: user_tenants user_tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_pkey PRIMARY KEY (id);


--
-- Name: user_tenants user_tenants_user_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_user_id_tenant_id_key UNIQUE (user_id, tenant_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_assets_branch_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_assets_branch_id ON public.assets USING btree (branch_id);


--
-- Name: idx_assets_internal_code; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_assets_internal_code ON public.assets USING btree (internal_code);


--
-- Name: idx_assets_rfid; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_assets_rfid ON public.assets USING btree (rfid_tag) WHERE (rfid_tag IS NOT NULL);


--
-- Name: idx_assets_status; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_assets_status ON public.assets USING btree (status);


--
-- Name: idx_assets_tenant_branch; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_assets_tenant_branch ON public.assets USING btree (tenant_id, branch_id);


--
-- Name: idx_assets_tenant_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_assets_tenant_id ON public.assets USING btree (tenant_id);


--
-- Name: idx_assets_type_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_assets_type_id ON public.assets USING btree (asset_type_id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_tenant_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_audit_logs_tenant_id ON public.audit_logs USING btree (tenant_id);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_backbone_tenant_branch; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_backbone_tenant_branch ON public.backbone_links USING btree (tenant_id, branch_id);


--
-- Name: idx_branches_tenant_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_branches_tenant_id ON public.branches USING btree (tenant_id);


--
-- Name: idx_locations_tenant_branch; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_locations_tenant_branch ON public.locations USING btree (tenant_id, branch_id);


--
-- Name: idx_nodes_tenant_branch; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_nodes_tenant_branch ON public.nodes USING btree (tenant_id, branch_id);


--
-- Name: idx_racks_tenant_branch; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_racks_tenant_branch ON public.racks USING btree (tenant_id, branch_id);


--
-- Name: idx_sessions_expires_at; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_sessions_expires_at ON public.sessions USING btree (expires_at);


--
-- Name: idx_sessions_token; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_sessions_token ON public.sessions USING btree (token);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id);


--
-- Name: idx_switches_tenant_branch; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_switches_tenant_branch ON public.switches USING btree (tenant_id, branch_id);


--
-- Name: idx_user_branches_branch_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_user_branches_branch_id ON public.user_branches USING btree (branch_id);


--
-- Name: idx_user_branches_user_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_user_branches_user_id ON public.user_branches USING btree (user_id);


--
-- Name: idx_user_tenants_tenant_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_user_tenants_tenant_id ON public.user_tenants USING btree (tenant_id);


--
-- Name: idx_user_tenants_user_id; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_user_tenants_user_id ON public.user_tenants USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: skia_user
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: assets update_assets_updated_at; Type: TRIGGER; Schema: public; Owner: skia_user
--

CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: locations update_locations_updated_at; Type: TRIGGER; Schema: public; Owner: skia_user
--

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_chat_history ai_chat_history_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.ai_chat_history
    ADD CONSTRAINT ai_chat_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: ai_chat_history ai_chat_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.ai_chat_history
    ADD CONSTRAINT ai_chat_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: api_keys api_keys_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: assets assets_asset_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_asset_type_id_fkey FOREIGN KEY (asset_type_id) REFERENCES public.asset_types(id);


--
-- Name: assets assets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: assets assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: assets assets_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: assets assets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: assets assets_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: backbone_links backbone_links_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.backbone_links
    ADD CONSTRAINT backbone_links_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: backbone_links backbone_links_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.backbone_links
    ADD CONSTRAINT backbone_links_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: backbone_links backbone_links_destination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.backbone_links
    ADD CONSTRAINT backbone_links_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: backbone_links backbone_links_origin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.backbone_links
    ADD CONSTRAINT backbone_links_origin_id_fkey FOREIGN KEY (origin_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: backbone_links backbone_links_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.backbone_links
    ADD CONSTRAINT backbone_links_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: branches branches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: integrators integrators_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.integrators
    ADD CONSTRAINT integrators_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: locations locations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: locations locations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: mdf_idf mdf_idf_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.mdf_idf
    ADD CONSTRAINT mdf_idf_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: mdf_idf mdf_idf_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.mdf_idf
    ADD CONSTRAINT mdf_idf_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: mdf_idf mdf_idf_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.mdf_idf
    ADD CONSTRAINT mdf_idf_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: nodes nodes_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: nodes nodes_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: nodes nodes_connected_switch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_connected_switch_id_fkey FOREIGN KEY (connected_switch_id) REFERENCES public.switches(id) ON DELETE SET NULL;


--
-- Name: nodes nodes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: patch_panels patch_panels_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.patch_panels
    ADD CONSTRAINT patch_panels_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: patch_panels patch_panels_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.patch_panels
    ADD CONSTRAINT patch_panels_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: patch_panels patch_panels_rack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.patch_panels
    ADD CONSTRAINT patch_panels_rack_id_fkey FOREIGN KEY (rack_id) REFERENCES public.racks(id) ON DELETE SET NULL;


--
-- Name: patch_panels patch_panels_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.patch_panels
    ADD CONSTRAINT patch_panels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: pdus pdus_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.pdus
    ADD CONSTRAINT pdus_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: pdus pdus_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.pdus
    ADD CONSTRAINT pdus_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: pdus pdus_rack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.pdus
    ADD CONSTRAINT pdus_rack_id_fkey FOREIGN KEY (rack_id) REFERENCES public.racks(id) ON DELETE SET NULL;


--
-- Name: pdus pdus_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.pdus
    ADD CONSTRAINT pdus_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: projects projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: racks racks_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.racks
    ADD CONSTRAINT racks_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: racks racks_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.racks
    ADD CONSTRAINT racks_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: racks racks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.racks
    ADD CONSTRAINT racks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: rfid_readers rfid_readers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.rfid_readers
    ADD CONSTRAINT rfid_readers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: roles roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sidebar_module_permissions sidebar_module_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.sidebar_module_permissions
    ADD CONSTRAINT sidebar_module_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: sidebar_module_permissions sidebar_module_permissions_sidebar_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.sidebar_module_permissions
    ADD CONSTRAINT sidebar_module_permissions_sidebar_module_id_fkey FOREIGN KEY (sidebar_module_id) REFERENCES public.sidebar_modules(id) ON DELETE CASCADE;


--
-- Name: switches switches_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.switches
    ADD CONSTRAINT switches_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: switches switches_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.switches
    ADD CONSTRAINT switches_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: switches switches_rack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.switches
    ADD CONSTRAINT switches_rack_id_fkey FOREIGN KEY (rack_id) REFERENCES public.racks(id) ON DELETE SET NULL;


--
-- Name: switches switches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.switches
    ADD CONSTRAINT switches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_config tenant_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_config
    ADD CONSTRAINT tenant_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_config tenant_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_config
    ADD CONSTRAINT tenant_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tenant_feature_flags tenant_feature_flags_feature_flag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_feature_flags
    ADD CONSTRAINT tenant_feature_flags_feature_flag_id_fkey FOREIGN KEY (feature_flag_id) REFERENCES public.feature_flags(id) ON DELETE CASCADE;


--
-- Name: tenant_feature_flags tenant_feature_flags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_feature_flags
    ADD CONSTRAINT tenant_feature_flags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_integrations tenant_integrations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.tenant_integrations
    ADD CONSTRAINT tenant_integrations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: ups ups_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.ups
    ADD CONSTRAINT ups_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: ups ups_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.ups
    ADD CONSTRAINT ups_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: ups ups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.ups
    ADD CONSTRAINT ups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_branches user_branches_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_branches
    ADD CONSTRAINT user_branches_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: user_branches user_branches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_branches
    ADD CONSTRAINT user_branches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_tenants user_tenants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_tenants user_tenants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: skia_user
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict xhzf5L6v7j0pRJTeYqv3yFaBWzFoi3E1hWvUnzSqrjXByPXaGYjU8h502CtbD8D

