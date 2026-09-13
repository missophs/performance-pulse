SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict kvmJgd7uEZ0dqSeFFIb3SJx1pyO60V3Jo49XUXlZPiINsffv8qsbLEqziXAdYpd

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."audit_log_entries" ("instance_id", "id", "payload", "created_at", "ip_address") FROM stdin;
\.


--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."custom_oauth_providers" ("id", "provider_type", "identifier", "name", "client_id", "client_secret", "acceptable_client_ids", "scopes", "pkce_enabled", "attribute_mapping", "authorization_params", "enabled", "email_optional", "issuer", "discovery_url", "skip_nonce_check", "cached_discovery", "discovery_cached_at", "authorization_url", "token_url", "userinfo_url", "jwks_uri", "created_at", "updated_at", "custom_claims_allowlist") FROM stdin;
\.


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."flow_state" ("id", "user_id", "auth_code", "code_challenge_method", "code_challenge", "provider_type", "provider_access_token", "provider_refresh_token", "created_at", "updated_at", "authentication_method", "auth_code_issued_at", "invite_token", "referrer", "oauth_client_state_id", "linking_target_id", "email_optional") FROM stdin;
ec98a011-f2ee-4ce9-b3f9-7f3ba6ec8ed3	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	711550dc-e6ad-495e-9db5-b746348dc57e	s256	C8OLTpBDcmmtLwCMSkXP_-94Hs_ejPBmtDGGmkRElJU	email			2026-08-19 18:43:41.823782+00	2026-08-19 18:54:25.119744+00	email/signup	2026-08-19 18:54:25.119682+00	\N	\N	\N	\N	f
8dcc73fd-3f8c-4685-b3dc-6410c61b991d	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	264e318d-5189-4ee7-899f-9b30d6a4a4f0	s256	4VdeRo_qQh_ibYVyoPOiKoppN2tn_M3XPX38JfOD0v0	magiclink			2026-08-21 22:16:38.527964+00	2026-08-21 22:16:47.108562+00	magiclink	2026-08-21 22:16:47.108496+00	\N	\N	\N	\N	f
9fce24e4-37d8-4458-9e2b-cfb2551bfb3e	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	019d295b-5cb5-4091-a523-b5c742cf91f7	s256	m4XBfpmZUx1DS4sgvYh_U8IXYLMJ6semca2iTEfrwLA	magiclink			2026-08-24 17:17:45.500043+00	2026-08-24 17:17:45.500043+00	magiclink	\N	\N	\N	\N	\N	f
2b15e68f-0f16-471a-9029-b5788f2025c3	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	9bb077cf-696e-48f8-973d-5852253cdcd8	s256	FBp7AQ5-4V9zD3n6eQiqvM8CjHIP_erUFVi2eblWclg	magiclink			2026-08-24 21:00:09.460984+00	2026-08-24 21:00:09.460984+00	magiclink	\N	\N	\N	\N	\N	f
f20d662a-8937-4b90-93e4-97281545be98	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	bcf1d3ea-23c3-417c-9a55-f0c88cc56bfa	s256	uSqefF2NE6yiBOKo2M4cM--JH5I1ArGmNk1ZCVYaGuY	magiclink			2026-08-24 21:00:13.649047+00	2026-08-24 21:00:20.429549+00	magiclink	2026-08-24 21:00:20.428632+00	\N	\N	\N	\N	f
63afd816-5555-4bb1-8887-b71e478b47c7	303312f5-de20-408d-b526-e757c5b21427	e49d68ed-e8bb-4fee-a761-b0b89d1fdfce	s256	K_QTx_mm17Oyq-gygmgpNqZ0E2WIDEZJFQAOXgoVBvs	recovery			2026-08-31 22:07:28.953728+00	2026-08-31 22:07:28.953728+00	recovery	\N	\N	\N	\N	\N	f
5facb936-c11f-4350-b3f9-d91796afb49f	\N	17507724-9c88-4c8a-9dec-a43f3dfbac4d	s256	4rtpMc58-eJ5TtxyDifh8ueO_BNyCui1rJagH5FKpPM	google			2026-09-05 00:51:57.077469+00	2026-09-05 00:51:57.077469+00	oauth	\N	\N	https://performance-pulse-lyart.vercel.app	\N	\N	f
2be6703f-f3b8-4650-94b1-00ce80f99402	ddefb1b9-57a7-4464-8091-f65dbbc48545	60ba3773-a103-4b6d-90bc-817c12b52608	s256	HamB6Swm5xMsE8UB9nnyBdey1RWMDZFEZdZMLWCbB4A	email			2026-09-05 01:19:43.982916+00	2026-09-05 01:19:43.982916+00	email/signup	\N	\N	\N	\N	\N	f
c806dcc2-5d78-4d92-8920-49cf3f171695	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	73fe5d7a-8ae0-44e3-b75b-c7f57015b85c	s256	CYs1F8lZT0VCzXS_h0Joakj6dZfRDA90k71PGoK0UZg	google	ya29.a0AdMD6EiD4wgtTvyy23Vc-q-QJ1C-D_anTAbCGD69X7hY2-JzTG571qHdeD668tBdzVpgx9zeKS0SctuvL4t6nZhbSSfk9OtYtKu9UUV3d1DTNqYHAvy8qF_CL0oXzQXXWyGNW6gOyTDsIpuCWSmwBtMOP5iWjhAid0zrMkw_IDB2O6UROm-GrUhI0CsYStLQMrd7qjTU36zr8PiCdpK0rxOMekavgqKLcYo6eX18aCI_qXu4M7RJqLIQHegTtmRJMccpM7sBw2Mavvg6gBUdPTPWYyLLaCgYKAeoSARESFQHGX2Miq38Swm2iJVoHjpVH4yZUOw0291		2026-09-05 23:14:28.061959+00	2026-09-05 23:14:28.424978+00	oauth	2026-09-05 23:14:28.424907+00	\N	https://performance-pulse-lyart.vercel.app/auth/callback	\N	\N	f
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") FROM stdin;
00000000-0000-0000-0000-000000000000	d07773b0-53a5-4803-8ae1-c966ce56d9c3	authenticated	authenticated	melissaw212+accounta@gmail.com	$2a$10$/r8XO8KjoE3hJwoAg2689eitK5ysEPMH9tTU/FYw6YJ5VT1zvQXPm	2026-08-27 00:19:35.254987+00	\N		2026-08-27 00:19:00.083437+00		2026-08-28 23:52:16.439177+00			\N	2026-08-28 23:53:02.880578+00	{"provider": "email", "providers": ["email"]}	{"sub": "d07773b0-53a5-4803-8ae1-c966ce56d9c3", "email": "melissaw212+accounta@gmail.com", "email_verified": true, "phone_verified": false}	\N	2026-08-27 00:19:00.049424+00	2026-08-28 23:53:02.924781+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	18e7c6b2-1669-4a9b-af0e-64026ce3462a	authenticated	authenticated	melissaw212+accountc@gmail.com	$2a$10$z5PGO6IsP7swoUnW.9CU3Op6AL5xuoyWEc1fNA1X1ULwnFSAMwSqW	2026-08-27 20:25:57.785074+00	\N		2026-08-27 20:25:27.699568+00		\N			\N	2026-08-27 20:25:59.151056+00	{"provider": "email", "providers": ["email"]}	{"sub": "18e7c6b2-1669-4a9b-af0e-64026ce3462a", "email": "melissaw212+accountc@gmail.com", "email_verified": true, "phone_verified": false}	\N	2026-08-27 20:25:27.591409+00	2026-08-27 20:25:59.171472+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	1fec5042-e43b-44dc-986b-6bc6c05140de	authenticated	authenticated	dhwconsulting3@gmail.com	$2a$10$7SSDvH/FZv6Az2SfBTKbT.HOSqr.q7WjwjQW/si/OYbm464zoXtby	2026-08-26 17:16:41.823723+00	\N		2026-08-26 17:16:21.991685+00		\N			\N	2026-09-06 19:33:21.385321+00	{"provider": "email", "providers": ["email", "google"]}	{"iss": "https://accounts.google.com", "sub": "102765215810121782281", "name": "dennis w", "email": "dhwconsulting3@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocJT8zOXTZFpudKrM7mPgJqu2hELhZSPXQc99W4EGxhvRC3Q4g=s96-c", "full_name": "dennis w", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocJT8zOXTZFpudKrM7mPgJqu2hELhZSPXQc99W4EGxhvRC3Q4g=s96-c", "provider_id": "102765215810121782281", "email_verified": true, "phone_verified": false}	\N	2026-08-26 17:16:21.910091+00	2026-09-06 19:33:21.396164+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	authenticated	authenticated	melissaw212@gmail.com	$2a$10$O4Ho1RD4a5sQdJtTtFWtmu.L5wUHKYoeGO2qXUBKHtpnqq7uIfP2u	2026-08-19 18:54:25.102479+00	\N		\N		\N			\N	2026-09-09 00:05:42.915825+00	{"provider": "email", "providers": ["email", "google"]}	{"iss": "https://accounts.google.com", "sub": "104852796244202993725", "name": "Melissa W", "email": "melissaw212@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocJaBjj4RxJO_IOxFRvE4lwVVwy_7l1FmzbOf_9pfoP9q-TmIg=s96-c", "full_name": "Melissa W", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocJaBjj4RxJO_IOxFRvE4lwVVwy_7l1FmzbOf_9pfoP9q-TmIg=s96-c", "provider_id": "104852796244202993725", "email_verified": true, "phone_verified": false}	\N	2026-08-19 18:43:41.811063+00	2026-09-09 19:17:08.028723+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	09d37160-5dee-426f-925c-112cb0c583ad	authenticated	authenticated	melissaw212+testboss@gmail.com	$2a$10$eFXy/qQbELL8xhdxm.HMtumSP.Olsw/xpOMGD/.VxXNjyB6sdbBqW	2026-08-26 16:02:22.43319+00	\N		2026-08-26 16:01:58.103332+00		\N			\N	2026-08-26 16:02:23.587479+00	{"provider": "email", "providers": ["email"]}	{"sub": "09d37160-5dee-426f-925c-112cb0c583ad", "email": "melissaw212+testboss@gmail.com", "email_verified": true, "phone_verified": false}	\N	2026-08-26 16:01:58.035484+00	2026-08-26 16:02:23.603566+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	1ecb6489-740d-4d84-b31e-064945ca48cb	authenticated	authenticated	melissahr212@gmail.com	$2a$10$KCSOyNvI4npSZsxJsf.T/eU.rYkDTrR76TwcnMocch916KntvbSRW	2026-08-31 21:21:31.177645+00	\N		\N		\N			\N	2026-09-09 20:03:58.475561+00	{"provider": "email", "providers": ["email", "google"]}	{"iss": "https://accounts.google.com", "sub": "112798439860435277483", "name": "melissa weiss", "email": "melissahr212@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocIiRpaLIaJr_Tc1zuQtftlI1oIhZIUA2n3gXfUUUF3k88yI9A=s96-c", "full_name": "melissa weiss", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocIiRpaLIaJr_Tc1zuQtftlI1oIhZIUA2n3gXfUUUF3k88yI9A=s96-c", "provider_id": "112798439860435277483", "email_verified": true, "phone_verified": false}	\N	2026-08-31 21:21:17.620343+00	2026-09-09 22:23:07.964925+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	303312f5-de20-408d-b526-e757c5b21427	authenticated	authenticated	swm3016@gmail.com	$2a$10$lRPiZNtlL3/ikUJetFnPZODkhlXc.Ccypy0AziKQ.owT/tsu7XHU.	2026-08-31 22:02:40.708937+00	\N		2026-08-31 22:02:24.120522+00		\N			\N	2026-08-31 22:08:17.78037+00	{"provider": "email", "providers": ["email"]}	{"sub": "303312f5-de20-408d-b526-e757c5b21427", "email": "swm3016@gmail.com", "email_verified": true, "phone_verified": false}	\N	2026-08-31 22:02:24.030322+00	2026-08-31 22:08:17.817076+00	\N	\N			\N		0	\N		\N	f	\N	f
\.


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") FROM stdin;
05ecd91e-e4af-478b-bdd4-aa826db1d0c1	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	{"sub": "05ecd91e-e4af-478b-bdd4-aa826db1d0c1", "email": "melissaw212@gmail.com", "email_verified": true, "phone_verified": false}	email	2026-08-19 18:43:41.819123+00	2026-08-19 18:43:41.81919+00	2026-08-19 18:43:41.81919+00	f783179b-f96a-4cf8-9b0d-5c4029dd6fc2
09d37160-5dee-426f-925c-112cb0c583ad	09d37160-5dee-426f-925c-112cb0c583ad	{"sub": "09d37160-5dee-426f-925c-112cb0c583ad", "email": "melissaw212+testboss@gmail.com", "email_verified": true, "phone_verified": false}	email	2026-08-26 16:01:58.078971+00	2026-08-26 16:01:58.079043+00	2026-08-26 16:01:58.079043+00	cec06a44-f1cb-4718-8c9d-60ca941ddc3b
1fec5042-e43b-44dc-986b-6bc6c05140de	1fec5042-e43b-44dc-986b-6bc6c05140de	{"sub": "1fec5042-e43b-44dc-986b-6bc6c05140de", "email": "dhwconsulting3@gmail.com", "email_verified": true, "phone_verified": false}	email	2026-08-26 17:16:21.971063+00	2026-08-26 17:16:21.971137+00	2026-08-26 17:16:21.971137+00	5e692695-d0c9-4439-ab0b-c657fcdf3997
d07773b0-53a5-4803-8ae1-c966ce56d9c3	d07773b0-53a5-4803-8ae1-c966ce56d9c3	{"sub": "d07773b0-53a5-4803-8ae1-c966ce56d9c3", "email": "melissaw212+accounta@gmail.com", "email_verified": true, "phone_verified": false}	email	2026-08-27 00:19:00.074842+00	2026-08-27 00:19:00.074902+00	2026-08-27 00:19:00.074902+00	a5c6f2ce-d5e6-4842-9ec1-2729d0ed9e5a
18e7c6b2-1669-4a9b-af0e-64026ce3462a	18e7c6b2-1669-4a9b-af0e-64026ce3462a	{"sub": "18e7c6b2-1669-4a9b-af0e-64026ce3462a", "email": "melissaw212+accountc@gmail.com", "email_verified": true, "phone_verified": false}	email	2026-08-27 20:25:27.671589+00	2026-08-27 20:25:27.671661+00	2026-08-27 20:25:27.671661+00	3b3e4c86-15f8-48e0-8fd0-95c0163b06d6
1ecb6489-740d-4d84-b31e-064945ca48cb	1ecb6489-740d-4d84-b31e-064945ca48cb	{"sub": "1ecb6489-740d-4d84-b31e-064945ca48cb", "email": "melissahr212@gmail.com", "email_verified": true, "phone_verified": false}	email	2026-08-31 21:21:17.660401+00	2026-08-31 21:21:17.660466+00	2026-08-31 21:21:17.660466+00	33166c26-37ab-430a-8bec-029a2087fb42
303312f5-de20-408d-b526-e757c5b21427	303312f5-de20-408d-b526-e757c5b21427	{"sub": "303312f5-de20-408d-b526-e757c5b21427", "email": "swm3016@gmail.com", "email_verified": true, "phone_verified": false}	email	2026-08-31 22:02:24.100454+00	2026-08-31 22:02:24.100515+00	2026-08-31 22:02:24.100515+00	b24eabeb-488a-4aab-b5e6-8b8ba1257581
104852796244202993725	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	{"iss": "https://accounts.google.com", "sub": "104852796244202993725", "name": "Melissa W", "email": "melissaw212@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocJaBjj4RxJO_IOxFRvE4lwVVwy_7l1FmzbOf_9pfoP9q-TmIg=s96-c", "full_name": "Melissa W", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocJaBjj4RxJO_IOxFRvE4lwVVwy_7l1FmzbOf_9pfoP9q-TmIg=s96-c", "provider_id": "104852796244202993725", "email_verified": true, "phone_verified": false}	google	2026-09-05 00:56:09.340232+00	2026-09-05 00:56:09.340317+00	2026-09-09 00:05:41.825358+00	ea7e21de-e350-47e0-8e03-d7ba9250fccf
112798439860435277483	1ecb6489-740d-4d84-b31e-064945ca48cb	{"iss": "https://accounts.google.com", "sub": "112798439860435277483", "name": "melissa weiss", "email": "melissahr212@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocIiRpaLIaJr_Tc1zuQtftlI1oIhZIUA2n3gXfUUUF3k88yI9A=s96-c", "full_name": "melissa weiss", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocIiRpaLIaJr_Tc1zuQtftlI1oIhZIUA2n3gXfUUUF3k88yI9A=s96-c", "provider_id": "112798439860435277483", "email_verified": true, "phone_verified": false}	google	2026-09-06 19:29:51.609504+00	2026-09-06 19:29:51.60956+00	2026-09-09 20:03:57.987489+00	b732d20a-375a-47d8-a833-8c660e4d4480
102765215810121782281	1fec5042-e43b-44dc-986b-6bc6c05140de	{"iss": "https://accounts.google.com", "sub": "102765215810121782281", "name": "dennis w", "email": "dhwconsulting3@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocJT8zOXTZFpudKrM7mPgJqu2hELhZSPXQc99W4EGxhvRC3Q4g=s96-c", "full_name": "dennis w", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocJT8zOXTZFpudKrM7mPgJqu2hELhZSPXQc99W4EGxhvRC3Q4g=s96-c", "provider_id": "102765215810121782281", "email_verified": true, "phone_verified": false}	google	2026-09-06 19:33:21.019577+00	2026-09-06 19:33:21.019641+00	2026-09-06 19:33:21.019641+00	f065272e-ac62-4d32-9d3b-d1821bac6c95
\.


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."instances" ("id", "uuid", "raw_base_config", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_clients" ("id", "client_secret_hash", "registration_type", "redirect_uris", "grant_types", "client_name", "client_uri", "logo_uri", "created_at", "updated_at", "deleted_at", "client_type", "token_endpoint_auth_method") FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") FROM stdin;
a6c72c24-bc16-488f-8817-40835ccf0833	1ecb6489-740d-4d84-b31e-064945ca48cb	2026-09-09 20:03:58.478714+00	2026-09-09 22:23:07.983403+00	\N	aal1	\N	2026-09-09 22:23:07.983283	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	108.54.122.7	\N	\N	\N	\N	\N
d3b34624-91f0-41a9-a4b4-2072b29b4e39	09d37160-5dee-426f-925c-112cb0c583ad	2026-08-26 16:02:23.590574+00	2026-08-26 16:02:23.590574+00	\N	aal1	\N	\N	node	52.55.133.121	\N	\N	\N	\N	\N
b2f57805-8897-48d8-80be-0f9179be9a16	18e7c6b2-1669-4a9b-af0e-64026ce3462a	2026-08-27 20:25:59.152406+00	2026-08-27 20:25:59.152406+00	\N	aal1	\N	\N	node	32.192.198.134	\N	\N	\N	\N	\N
cf363b33-d79b-47cd-adc2-2964fbc90a36	d07773b0-53a5-4803-8ae1-c966ce56d9c3	2026-08-27 20:31:56.924756+00	2026-08-28 22:05:51.522456+00	\N	aal1	\N	2026-08-28 22:05:51.522342	node	98.93.246.26	\N	\N	\N	\N	\N
e9b06d3b-2623-480b-b9e0-9118eb21b5a0	d07773b0-53a5-4803-8ae1-c966ce56d9c3	2026-08-28 23:53:02.882868+00	2026-08-28 23:53:02.882868+00	\N	aal1	\N	\N	node	3.231.164.101	\N	\N	\N	\N	\N
0871f79f-f23b-41c2-b718-ca377927b686	303312f5-de20-408d-b526-e757c5b21427	2026-08-31 22:08:17.782832+00	2026-08-31 22:08:17.782832+00	\N	aal1	\N	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	108.30.129.44	\N	\N	\N	\N	\N
\.


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") FROM stdin;
d3b34624-91f0-41a9-a4b4-2072b29b4e39	2026-08-26 16:02:23.604765+00	2026-08-26 16:02:23.604765+00	email/signup	283b7634-b962-476d-819e-a4194852a886
b2f57805-8897-48d8-80be-0f9179be9a16	2026-08-27 20:25:59.17289+00	2026-08-27 20:25:59.17289+00	email/signup	d8d5e79b-1146-4ca7-9115-e3d11512d808
cf363b33-d79b-47cd-adc2-2964fbc90a36	2026-08-27 20:31:56.935001+00	2026-08-27 20:31:56.935001+00	magiclink	070a7c85-9ccf-45ba-9dbc-62b57f21f2ef
e9b06d3b-2623-480b-b9e0-9118eb21b5a0	2026-08-28 23:53:02.926278+00	2026-08-28 23:53:02.926278+00	magiclink	cad47ecd-646c-42bc-aea8-6165011f500d
0871f79f-f23b-41c2-b718-ca377927b686	2026-08-31 22:08:17.825136+00	2026-08-31 22:08:17.825136+00	password	b897a1dc-fb8b-4040-9d58-b30f26723eb0
a6c72c24-bc16-488f-8817-40835ccf0833	2026-09-09 20:03:58.511632+00	2026-09-09 20:03:58.511632+00	oauth	1e269e12-83bb-4aca-acac-60a36901bf5c
\.


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_factors" ("id", "user_id", "friendly_name", "factor_type", "status", "created_at", "updated_at", "secret", "phone", "last_challenged_at", "web_authn_credential", "web_authn_aaguid", "last_webauthn_challenge_data") FROM stdin;
\.


--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_challenges" ("id", "factor_id", "created_at", "verified_at", "ip_address", "otp_code", "web_authn_session_data") FROM stdin;
\.


--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_authorizations" ("id", "authorization_id", "client_id", "user_id", "redirect_uri", "scope", "state", "resource", "code_challenge", "code_challenge_method", "response_type", "status", "authorization_code", "created_at", "expires_at", "approved_at", "nonce") FROM stdin;
\.


--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_client_states" ("id", "provider_type", "code_verifier", "created_at") FROM stdin;
\.


--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_consents" ("id", "user_id", "client_id", "scopes", "granted_at", "revoked_at") FROM stdin;
\.


--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."one_time_tokens" ("id", "user_id", "token_type", "token_hash", "relates_to", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") FROM stdin;
00000000-0000-0000-0000-000000000000	89	pjbifb4ocjij	1ecb6489-740d-4d84-b31e-064945ca48cb	t	2026-09-09 20:03:58.498028+00	2026-09-09 22:23:07.926153+00	\N	a6c72c24-bc16-488f-8817-40835ccf0833
00000000-0000-0000-0000-000000000000	90	scipztp2qipn	1ecb6489-740d-4d84-b31e-064945ca48cb	f	2026-09-09 22:23:07.949649+00	2026-09-09 22:23:07.949649+00	pjbifb4ocjij	a6c72c24-bc16-488f-8817-40835ccf0833
00000000-0000-0000-0000-000000000000	12	qrlpw5nkr2p7	09d37160-5dee-426f-925c-112cb0c583ad	f	2026-08-26 16:02:23.599833+00	2026-08-26 16:02:23.599833+00	\N	d3b34624-91f0-41a9-a4b4-2072b29b4e39
00000000-0000-0000-0000-000000000000	17	nvoa43qalzmt	18e7c6b2-1669-4a9b-af0e-64026ce3462a	f	2026-08-27 20:25:59.161381+00	2026-08-27 20:25:59.161381+00	\N	b2f57805-8897-48d8-80be-0f9179be9a16
00000000-0000-0000-0000-000000000000	18	jppxvmttkvry	d07773b0-53a5-4803-8ae1-c966ce56d9c3	t	2026-08-27 20:31:56.929547+00	2026-08-28 22:05:51.488268+00	\N	cf363b33-d79b-47cd-adc2-2964fbc90a36
00000000-0000-0000-0000-000000000000	19	astvefs6jb6v	d07773b0-53a5-4803-8ae1-c966ce56d9c3	f	2026-08-28 22:05:51.496919+00	2026-08-28 22:05:51.496919+00	jppxvmttkvry	cf363b33-d79b-47cd-adc2-2964fbc90a36
00000000-0000-0000-0000-000000000000	20	7yjk3mrwf64y	d07773b0-53a5-4803-8ae1-c966ce56d9c3	f	2026-08-28 23:53:02.904076+00	2026-08-28 23:53:02.904076+00	\N	e9b06d3b-2623-480b-b9e0-9118eb21b5a0
00000000-0000-0000-0000-000000000000	30	n7uxmtspmwl7	303312f5-de20-408d-b526-e757c5b21427	f	2026-08-31 22:08:17.80523+00	2026-08-31 22:08:17.80523+00	\N	0871f79f-f23b-41c2-b718-ca377927b686
\.


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."sso_providers" ("id", "resource_id", "created_at", "updated_at", "disabled") FROM stdin;
\.


--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."saml_providers" ("id", "sso_provider_id", "entity_id", "metadata_xml", "metadata_url", "attribute_mapping", "created_at", "updated_at", "name_id_format") FROM stdin;
\.


--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."saml_relay_states" ("id", "sso_provider_id", "request_id", "for_email", "redirect_to", "created_at", "updated_at", "flow_state_id") FROM stdin;
\.


--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."sso_domains" ("id", "sso_provider_id", "domain", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."webauthn_challenges" ("id", "user_id", "challenge_type", "session_data", "created_at", "expires_at") FROM stdin;
\.


--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."webauthn_credentials" ("id", "user_id", "credential_id", "public_key", "attestation_type", "aaguid", "sign_count", "transports", "backup_eligible", "backed_up", "friendly_name", "created_at", "updated_at", "last_used_at") FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."profiles" ("id", "email", "full_name", "created_at") FROM stdin;
05ecd91e-e4af-478b-bdd4-aa826db1d0c1	melissaw212@gmail.com	melissa	2026-08-19 18:43:41.810678+00
09d37160-5dee-426f-925c-112cb0c583ad	melissaw212+testboss@gmail.com	Test Boss D	2026-08-26 16:01:58.034119+00
1fec5042-e43b-44dc-986b-6bc6c05140de	dhwconsulting3@gmail.com		2026-08-26 17:16:21.908269+00
d07773b0-53a5-4803-8ae1-c966ce56d9c3	melissaw212+accounta@gmail.com	melissa	2026-08-27 00:19:00.048222+00
18e7c6b2-1669-4a9b-af0e-64026ce3462a	melissaw212+accountc@gmail.com	Account C (test)	2026-08-27 20:25:27.589146+00
303312f5-de20-408d-b526-e757c5b21427	swm3016@gmail.com	Password Test	2026-08-31 22:02:24.027882+00
1ecb6489-740d-4d84-b31e-064945ca48cb	melissahr212@gmail.com	Monte Montoya	2026-08-31 21:21:17.618584+00
\.


--
-- Data for Name: pairs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."pairs" ("id", "employee_id", "manager_id", "employee_email", "manager_email", "next_1on1_date", "next_1on1_time", "next_1on1_focus", "hr_email", "assist_enabled", "how_to_hidden", "created_at", "closed_at", "closing_note", "employee_label", "suggested_1on1_date", "suggested_1on1_time", "suggested_1on1_note") FROM stdin;
1f797fe2-77da-48c1-bdf4-6a901eacf22e	303312f5-de20-408d-b526-e757c5b21427	\N	swm3016@gmail.com	pp-password-test-partner@example.com	\N	\N			t	f	2026-08-31 22:04:06.236553+00	2026-09-06 20:20:17.141+00	Closed by HR from the org chart	\N	\N	\N	\N
ef589901-6485-45d5-9bf7-5084d5b83c07	\N	\N	marcus.doyle@placeholder.test	ann.steiner@placeholder.test	\N	\N			t	f	2026-09-06 20:29:21.511005+00	\N	\N	Marcus Doyle	\N	\N	\N
d3a05943-2dc3-43e7-b21d-eb2bb62cc929	\N	\N	priya.nair@placeholder.test	ann.steiner@placeholder.test	\N	\N			t	f	2026-09-06 20:29:22.369651+00	\N	\N	Priya Nair	\N	\N	\N
bf2bf4f3-2aa2-4f40-b9eb-c9e277c4bb50	\N	\N	theo.brandt@placeholder.test	ann.steiner@placeholder.test	\N	\N			t	f	2026-09-06 20:29:22.974175+00	\N	\N	Theo Brandt	\N	\N	\N
78cde1da-d348-47f0-bf69-d8b127cc6a74	\N	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	ann.steiner@placeholder.test	melissaw212@gmail.com	\N	\N			t	f	2026-09-06 20:29:19.015282+00	\N	\N	Ann Steiner	\N	\N	\N
9d7ecb33-0a60-4728-aa7d-b8fcc6827b90	\N	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	devon.park@placeholder.test	melissaw212@gmail.com	\N	\N			t	f	2026-09-06 20:29:19.564415+00	\N	\N	Devon Park	\N	\N	\N
35d0b8a1-e5ba-485f-a2fe-04ca8379b1d5	\N	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	sasha.reyes@placeholder.test	melissaw212@gmail.com	\N	\N			t	f	2026-09-06 20:29:20.036919+00	\N	\N	Sasha Reyes	\N	\N	\N
da554c03-4da6-4589-b406-4830e362e959	\N	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	kiran.bhatt@placeholder.test	melissaw212@gmail.com	\N	\N			t	f	2026-09-06 20:29:20.656058+00	\N	\N	Kiran Bhatt	\N	\N	\N
1c9c9d59-ec9f-4449-aa7d-c4ff8d8cdd4e	\N	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	lena.ford@placeholder.test	melissaw212@gmail.com	\N	\N			t	f	2026-09-06 20:29:21.095324+00	\N	\N	Lena Ford	\N	\N	\N
22daee63-e852-44a8-aa0c-272715813425	\N	1ecb6489-740d-4d84-b31e-064945ca48cb	wren.castillo@placeholder.test	melissahr212@gmail.com	\N	\N			t	f	2026-09-05 20:42:20.275636+00	\N	Closed by HR from the org chart	\N	\N	\N	\N
c60688f0-1df8-4dec-8249-3f0b600df573	303312f5-de20-408d-b526-e757c5b21427	1ecb6489-740d-4d84-b31e-064945ca48cb	swm3016@gmail.com	melissahr212@gmail.com	\N	\N			t	f	2026-09-07 22:32:42.587071+00	\N	\N	Stella Weiss	\N	\N	\N
9ca531ec-c38f-42b6-8aaa-e1c0a5528aab	\N	\N	marcus.doyle@placeholder.test	ann.steiner@placeholder.test	\N	\N			t	f	2026-09-05 20:42:18.181074+00	2026-09-06 20:16:45.617+00	Closed by HR from the org chart	\N	\N	\N	\N
9caa1727-5463-46b7-87d6-8ca12ee92f03	\N	\N	priya.nair@placeholder.test	ann.steiner@placeholder.test	\N	\N			t	f	2026-09-05 20:42:18.94905+00	2026-09-06 20:17:18.984+00	Closed by HR from the org chart	\N	\N	\N	\N
22d7ba50-1764-422f-b6c1-4d6e4e8dca27	\N	\N	theo.brandt@placeholder.test	ann.steiner@placeholder.test	\N	\N			t	f	2026-09-05 20:42:19.576598+00	2026-09-06 20:18:03.579+00	Closed by HR from the org chart	\N	\N	\N	\N
2a0e4b7b-41a9-42e8-88f4-d00eac08c136	d07773b0-53a5-4803-8ae1-c966ce56d9c3	\N	melissaw212+accounta@gmail.com	boss@test.com	\N	\N			t	f	2026-08-27 00:22:44.356931+00	2026-09-06 20:18:23.047+00	Closed by HR from the org chart	\N	\N	\N	\N
2cd1edfe-3d52-462d-9040-a2c8c4f00e7e	\N	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	ann.steiner@placeholder.test	melissaw212@gmail.com	\N	\N			t	f	2026-09-05 23:12:43.268596+00	2026-09-06 20:18:34.422+00	Closed by HR from the org chart	Ann Steiner	\N	\N	\N
1716dd63-41e8-4b2d-b232-3e50c78a762c	\N	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	devon.park@placeholder.test	melissaw212@gmail.com	\N	\N			t	f	2026-09-05 23:12:44.544236+00	2026-09-06 20:18:46.714+00	Closed by HR from the org chart	Devon Park	\N	\N	\N
729f1576-54f6-4c41-9886-995ba383acc2	\N	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	sasha.reyes@placeholder.test	melissaw212@gmail.com	\N	\N			t	f	2026-09-05 23:12:45.707048+00	2026-09-06 20:18:58.226+00	Closed by HR from the org chart	Sasha Reyes	\N	\N	\N
50dec8c6-f117-4254-835c-6437b45de164	\N	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	kiran.bhatt@placeholder.test	melissaw212@gmail.com	\N	\N			t	f	2026-09-05 23:12:46.297357+00	2026-09-06 20:19:08.682+00	Closed by HR from the org chart	Kiran Bhatt	\N	\N	\N
e67bcb1c-71f0-40ea-9804-7804513d9cae	\N	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	lena.ford@placeholder.test	melissaw212@gmail.com	\N	\N			t	f	2026-09-05 23:12:47.25164+00	2026-09-06 20:19:20.579+00	Closed by HR from the org chart	Lena Ford	\N	\N	\N
29d4b909-a7a6-4a95-bda4-1da2446519e7	18e7c6b2-1669-4a9b-af0e-64026ce3462a	d07773b0-53a5-4803-8ae1-c966ce56d9c3	melissaw212+accountc@gmail.com	melissaw212+accountA@gmail.com	\N	\N			t	f	2026-08-27 20:26:41.791275+00	2026-09-06 20:19:32.061+00	Closed by HR from the org chart	\N	\N	\N	\N
044f1251-a159-48f9-9dc7-c661f94258b2	\N	1ecb6489-740d-4d84-b31e-064945ca48cb	pp-switcher-test@example.com	melissahr212@gmail.com	\N	\N			t	f	2026-08-31 21:27:10.609837+00	2026-09-06 20:19:42.68+00	Closed by HR from the org chart	\N	\N	\N	\N
415f55be-a2ea-4619-94ea-339cee0db616	1ecb6489-740d-4d84-b31e-064945ca48cb	\N	melissahr212@gmail.com	melissahr212@gmail.com	\N	\N			t	f	2026-08-31 21:22:26.960511+00	2026-09-06 20:19:54.32+00	Closed by HR from the org chart	\N	\N	\N	\N
\.


--
-- Data for Name: achievements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."achievements" ("id", "pair_id", "title", "category", "impact", "achievement_date", "created_by_role", "created_by_name", "created_at") FROM stdin;
\.


--
-- Data for Name: actions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."actions" ("id", "pair_id", "text", "owner_label", "due_date", "status", "related", "notes", "created_by_name", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: activity_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."activity_log" ("id", "pair_id", "entity", "entity_id", "label", "field", "old_value", "new_value", "actor_name", "actor_role", "source", "created_at") FROM stdin;
\.


--
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."app_settings" ("key", "value", "updated_at") FROM stdin;
hr_handbook_passcode	1111	2026-09-04 21:57:54.846343+00
\.


--
-- Data for Name: career_answers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."career_answers" ("id", "pair_id", "role", "question", "answer", "created_by_name", "created_at") FROM stdin;
de4d25f9-efbc-4671-aee1-cb426767cf47	415f55be-a2ea-4619-94ea-339cee0db616	manager	What strengths do you see in stella?	Slack test: strengths answer	stella	2026-08-31 22:28:51.027136+00
\.


--
-- Data for Name: meetings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."meetings" ("id", "pair_id", "meeting_date", "meeting_time", "discussed", "agreed", "revisit", "start_line", "stop_line", "keep_line", "checkin90_date", "topics_snapshot", "created_by_name", "created_at") FROM stdin;
\.


--
-- Data for Name: checkins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."checkins" ("id", "pair_id", "role", "asked", "meeting_id", "created_at", "in_progress", "draft_state") FROM stdin;
\.


--
-- Data for Name: concerns; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."concerns" ("id", "pair_id", "what", "concern_date", "expectation", "communicated", "previously", "support", "outcome", "created_by_name", "created_at") FROM stdin;
\.


--
-- Data for Name: custom_suggestions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."custom_suggestions" ("id", "pair_id", "role", "text", "category", "created_at") FROM stdin;
\.


--
-- Data for Name: development_plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."development_plans" ("id", "pair_id", "area", "why", "type", "activity", "support", "target_date", "status", "measure", "created_by_role", "created_by_name", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."documents" ("id", "pair_id", "name", "url", "storage_path", "size", "mime_type", "created_by_name", "created_at") FROM stdin;
5924accc-ab67-43e8-8f54-e5de808c29ed	415f55be-a2ea-4619-94ea-339cee0db616	Slack test doc	https://example.com/test-doc	\N	\N	\N	stella	2026-08-31 22:29:11.859475+00
\.


--
-- Data for Name: feedback_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."feedback_entries" ("id", "pair_id", "giver_role", "from_name", "to_name", "type", "text", "example", "created_at", "response", "responded_at") FROM stdin;
\.


--
-- Data for Name: feedback_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."feedback_requests" ("id", "pair_id", "from_role", "from_name", "about", "why", "status", "created_at") FROM stdin;
\.


--
-- Data for Name: form_drafts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."form_drafts" ("pair_id", "role", "kind", "draft", "updated_at") FROM stdin;
\.


--
-- Data for Name: goals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."goals" ("id", "pair_id", "text", "why", "measure", "owner_label", "target_date", "status", "progress", "obstacles", "support", "created_by_name", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: handbook_links; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."handbook_links" ("id", "title", "url", "created_at", "storage_path", "size", "mime_type") FROM stdin;
0e06ee4e-5082-4f64-935e-95a0bf6b012d	2025 US_IPH_Employee_Handbook_Final.pdf	\N	2026-09-02 15:58:57.514131+00	9a68e948-c202-4ed0-a372-46133a7f9b6c-2025 US_IPH_Employee_Handbook_Final.pdf	1364484	application/pdf
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."messages" ("id", "pair_id", "kind", "text", "role", "created_by_name", "created_at") FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."notifications" ("id", "pair_id", "text", "created_by_role", "to_role", "view", "read", "created_at", "kind", "entity_id") FROM stdin;
bf7d5106-e98d-4190-af4b-0279206e8c97	415f55be-a2ea-4619-94ea-339cee0db616	stella added a topic to the agenda	manager	employee	oneOnOne	f	2026-08-31 22:28:33.347851+00	\N	\N
27a4f09a-5f79-4d38-a419-e079a294f550	415f55be-a2ea-4619-94ea-339cee0db616	stella updated their career conversation	manager	employee	career	f	2026-08-31 22:28:51.178203+00	\N	\N
eab1972c-76e6-475c-b75f-f66d3eaa9d41	415f55be-a2ea-4619-94ea-339cee0db616	stella added an action: Slack test action	manager	employee	actions	f	2026-08-31 22:59:39.418388+00	action	\N
c64b071e-646d-46a5-8a57-310b50ef388e	415f55be-a2ea-4619-94ea-339cee0db616	stella added a development plan: Slack test dev plan	manager	employee	development	f	2026-08-31 23:00:43.429314+00	dev	\N
16ea864f-b298-4b79-9fdf-4a13db8aed34	415f55be-a2ea-4619-94ea-339cee0db616	Development plan removed: Slack test dev plan	manager	employee	\N	f	2026-08-31 23:00:50.906537+00	\N	\N
cf519c3d-f2bb-4d01-a17c-9e41620ead5e	415f55be-a2ea-4619-94ea-339cee0db616	stella logged an achievement: Slack test achievement	manager	employee	performance	f	2026-08-31 23:01:15.152122+00	achievement	\N
\.


--
-- Data for Name: review_drafts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."review_drafts" ("pair_id", "role", "draft", "updated_at") FROM stdin;
\.


--
-- Data for Name: slack_pair_selections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."slack_pair_selections" ("slack_user_id", "pair_id", "updated_at") FROM stdin;
U0BPYL803JT	c60688f0-1df8-4dec-8249-3f0b600df573	2026-09-09 21:02:37.861+00
\.


--
-- Data for Name: topics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."topics" ("id", "pair_id", "text", "why", "category", "status", "notes", "created_by_role", "created_by_name", "created_at", "updated_at", "submitted_at") FROM stdin;
bda888dc-2647-4a53-96fd-bf0cbf2cd3a4	415f55be-a2ea-4619-94ea-339cee0db616	bb	gg	Wins	open		manager	stella	2026-09-04 14:15:29.167742+00	2026-09-04 14:15:29.167742+00	\N
\.


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type", "versioning_status") FROM stdin;
documents	documents	\N	2026-08-19 18:35:43.016427+00	2026-08-19 18:35:43.016427+00	f	f	\N	\N	\N	STANDARD	DISABLED
handbook	handbook	\N	2026-09-02 15:53:46.235804+00	2026-09-02 15:53:46.235804+00	f	f	\N	\N	\N	STANDARD	DISABLED
\.


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."buckets_analytics" ("name", "type", "format", "created_at", "updated_at", "id", "deleted_at") FROM stdin;
\.


--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."buckets_vectors" ("id", "type", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."objects" ("id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata", "archived_at", "is_delete_marker", "is_versioned") FROM stdin;
8fa3a414-85ae-4291-85b5-a0f683646934	handbook	9a68e948-c202-4ed0-a372-46133a7f9b6c-2025 US_IPH_Employee_Handbook_Final.pdf	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	2026-09-02 15:58:57.166475+00	2026-09-02 15:58:57.166475+00	2026-09-02 15:58:57.166475+00	{"eTag": "\\"9e8e4eeec655bf321edcdb99cd0041e3\\"", "size": 1364484, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-09-02T15:58:58.000Z", "contentLength": 1364484, "httpStatusCode": 200}	ab38a5f7-5ef4-41ae-8241-e21ce3b6ed39	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	{}	\N	f	f
7bddb6b2-3089-497a-bb86-d04ef946d133	documents	34a8e583-afe4-468d-9168-b9dc76983666/6e3d05d5-d914-47b4-b7ae-f576c1faa54f-test-document.txt	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	2026-09-02 16:58:51.676149+00	2026-09-02 16:58:51.676149+00	2026-09-02 16:58:51.676149+00	{"eTag": "\\"27096ad936e54adeef159bc5fde6fa90\\"", "size": 62, "mimetype": "text/plain", "cacheControl": "max-age=3600", "lastModified": "2026-09-02T16:58:52.000Z", "contentLength": 62, "httpStatusCode": 200}	452e4412-79bd-489f-9f0c-8fca62bf064c	05ecd91e-e4af-478b-bdd4-aa826db1d0c1	{}	\N	f	f
\.


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."s3_multipart_uploads" ("id", "in_progress_size", "upload_signature", "bucket_id", "key", "version", "owner_id", "created_at", "user_metadata", "metadata") FROM stdin;
\.


--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."s3_multipart_uploads_parts" ("id", "upload_id", "size", "part_number", "bucket_id", "key", "etag", "owner_id", "version", "created_at") FROM stdin;
\.


--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."vector_indexes" ("id", "name", "bucket_id", "data_type", "dimension", "distance_metric", "metadata_configuration", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: hooks; Type: TABLE DATA; Schema: supabase_functions; Owner: postgres
--

COPY "supabase_functions"."hooks" ("id", "hook_table_id", "hook_name", "created_at", "request_id") FROM stdin;
3	17717	slack_notify	2026-09-09 02:40:10.217351+00	75
4	17717	slack_notify	2026-09-12 18:58:20.700987+00	76
5	17717	slack_notify	2026-09-12 21:55:28.630828+00	77
6	17717	slack_notify	2026-09-12 21:56:11.398942+00	78
\.


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 90, true);


--
-- Name: hooks_id_seq; Type: SEQUENCE SET; Schema: supabase_functions; Owner: postgres
--

SELECT pg_catalog.setval('"supabase_functions"."hooks_id_seq"', 6, true);


--
-- PostgreSQL database dump complete
--

-- \unrestrict kvmJgd7uEZ0dqSeFFIb3SJx1pyO60V3Jo49XUXlZPiINsffv8qsbLEqziXAdYpd

RESET ALL;
