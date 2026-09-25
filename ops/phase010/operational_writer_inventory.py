"""Offline writer-accounting gate; never collects secrets or isolates a writer.

Inputs are a reviewed inventory and a freshly collected inventory. A matching
snapshot is NOT window authorization: future protected operator attestation,
scheduled-mutator exclusion and live zero-client checks remain mandatory.
"""

QUIESCENCE_SQL = """SELECT count(*)
FROM pg_stat_activity
WHERE datname = current_database()
  AND backend_type = 'client backend'
  AND pid <> pg_backend_pid();"""

SURFACES = frozenset(('db_clients', 'containers', 'host_processes', 'services',
    'timers', 'cron', 'user_crontabs', 'imports_workers', 'maintenance_deployment',
    'operator_admin', 'bootstrap', 'migration_runner', 'shared_nginx'))

# Explicit actions, not an arbitrary caller-provided exemption string.
ACTIONS = {
    'api_pools_and_inprocess_workers': 'CLOSE_DRAIN_STOP_API_NO_RECONNECT',
    'operator_root_docker_access': 'EXCLUSIVE_OPERATOR_NO_MANUAL_CLIENTS',
    'bootstrap_psql_authority': 'NO_PARALLEL_BOOTSTRAP_OR_PSQL',
    'bounded_migration_runner': 'SOLE_SEPARATELY_AUTHORIZED_RUNNER',
    'maintenance_deployment_packages': 'NO_PARALLEL_MAINTENANCE_DEPLOYMENT',
    'shared_nginx_administrators': 'NO_PARALLEL_VHOST_EDIT_OR_RELOAD',
    'bajanet_certificate_cron': 'AVOID_SCHEDULE_AND_VERIFY_NO_ACTIVE_JOB',
    'system_package_maintenance': 'NO_PACKAGE_JOB_OR_SERVICE_RESTART_IN_WINDOW',
}


def validate(reviewed, fresh):
    """Compare non-secret authority identities, not only current DB sessions.

The caller must independently review the baseline; auto-enrolling discoveries
would defeat this gate. No network, SQL execution or filesystem mutation occurs.
"""
    def require(ok, code):
        if not ok:
            raise ValueError(code)

    for snapshot in (reviewed, fresh):
        require(set(snapshot['surfaces']) == SURFACES, 'INCOMPLETE_SURFACES')
        require(snapshot['unreadable_surfaces'] == [], 'UNREADABLE_SURFACE')
        require(snapshot['unknown_authorities'] == [], 'UNKNOWN_AUTHORITY')
        require(snapshot['unknown_scheduled_mutators'] == [], 'UNKNOWN_SCHEDULED_MUTATOR')
        require(snapshot['unknown_nginx_mutators'] == [], 'UNKNOWN_NGINX_MUTATOR')
        require(snapshot['actions'] == ACTIONS, 'INCOMPLETE_EXCLUSION_MAP')
        require(snapshot['quiescence_sql'] == QUIESCENCE_SQL, 'QUIESCENCE_CONTRACT')
        identities = snapshot['container_identities']
        require(len(identities) == len(set(identities)) and bool(identities), 'CONTAINER_IDENTITIES')
        for client in snapshot['db_clients']:
            require(client['container_id'] in identities, 'UNMAPPED_DB_CLIENT')
            require(client['authority'] == 'api_pools_and_inprocess_workers', 'UNMAPPED_WRITER')
            require(client['role'] in ('skia_runtime', 'skia_migrator', 'skia_onboarding'), 'UNKNOWN_ROLE')
            require(type(client['count']) is int and client['count'] > 0, 'CLIENT_COUNT')
    # Observation time changes on recollection; authority identities may not.
    # Freshness is a separate live-window prerequisite, not certified by this
    # offline comparison of a retained historical observation.
    comparable = lambda value: {k: v for k, v in value.items() if k != 'observation_utc'}
    require(comparable(fresh) == comparable(reviewed), 'INVENTORY_DRIFT_REVIEW_REQUIRED')
    return {'mapped_client_count': sum(c['count'] for c in fresh['db_clients']),
            'unmapped_clients': 0, 'window_authorized': False,
            'isolation_performed': False}


def require_quiescence(other_client_count):
    if type(other_client_count) is not int or other_client_count != 0:
        raise ValueError('OTHER_CLIENT_BACKENDS_PRESENT')
