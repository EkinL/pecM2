# Monitoring local (Grafana + Prometheus)

Cette stack lit les metriques de l'app Next via `http://localhost:3000/api/metrics`.
Docker Desktop (ou un daemon Docker equivalent) doit etre demarre avant `docker compose`.

## 1) Lancer l'app Next

```bash
cd next
npm run dev
```

## 2) Lancer Prometheus + Grafana

Depuis la racine du repo:

```bash
docker compose --env-file monitoring/.env -f monitoring/docker-compose.yml up -d
```

## 3) Acces

- Grafana: `http://localhost:3001` (`admin` / `admin` par defaut)
- Prometheus: `http://localhost:9090`

Le dashboard `Next Runtime Overview` est provisionne automatiquement (dossier `PEC`).

## 4) Arreter la stack

```bash
docker compose --env-file monitoring/.env -f monitoring/docker-compose.yml down
```

## 5) Notes

- Cible Prometheus par defaut: `host.docker.internal:3000` sur `/api/metrics`
- Sur Linux natif, `host.docker.internal` est mappe via `extra_hosts` dans le compose.
- Change les identifiants Grafana avec:
  - `GRAFANA_ADMIN_USER`
  - `GRAFANA_ADMIN_PASSWORD`

## 6) Metriques metier disponibles

L endpoint `/api/metrics` expose maintenant:

- API:
  - `app_api_requests_total{route,method,status}`
  - `app_api_errors_total{route,method,status_class}`
  - `app_api_request_duration_seconds`
- Firestore:
  - `app_firestore_operations_total{operation,collection,status}`
  - `app_firestore_operation_duration_seconds`
- APIs externes:
  - `app_external_api_requests_total{provider,endpoint,status}`
  - `app_external_api_errors_total{provider,endpoint,status_class}`
  - `app_external_api_request_duration_seconds`
- Metier:
  - `app_business_messages_total{kind,author_role,source}`
  - `app_business_tokens_spent_total{kind,source}`
  - `app_business_tokens_granted_total{source}`

Exemples de requetes PromQL:

- Erreurs API (5xx) par route:
  - `sum by (route) (rate(app_api_errors_total{status_class="5xx"}[5m]))`
- Latence p95 par route:
  - `histogram_quantile(0.95, sum by (le, route) (rate(app_api_request_duration_seconds_bucket[5m])))`
- Appels Firestore par operation:
  - `sum by (operation, collection) (rate(app_firestore_operations_total[5m]))`
- Tokens depenses:
  - `sum(rate(app_business_tokens_spent_total[5m]))`

## 7) Brancher Google Cloud Monitoring (Firebase/GCP natif)

Cette stack provisionne aussi une datasource Grafana `Google Cloud Monitoring` (type `stackdriver`).

### Prerequis GCP

1. Active les APIs sur ton projet GCP:

```bash
gcloud services enable monitoring.googleapis.com cloudresourcemanager.googleapis.com
```

2. Cree un service account dedie Grafana:

```bash
gcloud iam service-accounts create grafana-monitoring \
  --display-name="Grafana Monitoring"
```

3. Donne-lui au minimum le role lecture Monitoring:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:grafana-monitoring@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/monitoring.viewer"
```

4. Genere une cle JSON:

```bash
mkdir -p monitoring/secrets/gcp
gcloud iam service-accounts keys create monitoring/secrets/gcp/grafana-gcp-sa.json \
  --iam-account="grafana-monitoring@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

5. Extrait la cle privee PEM (attendue par le provisioning Grafana):

```bash
jq -r '.private_key' monitoring/secrets/gcp/grafana-gcp-sa.json > monitoring/secrets/gcp/grafana-gcp-key.pem
chmod 600 monitoring/secrets/gcp/grafana-gcp-key.pem
```

6. Cree ton fichier d env:

```bash
cp monitoring/.env.example monitoring/.env
```

Puis renseigne:
- `GCP_PROJECT_ID`
- `GCP_SA_CLIENT_EMAIL`

7. Relance Grafana:

```bash
docker compose --env-file monitoring/.env -f monitoring/docker-compose.yml up -d
```

### Verification

- Ouvre Grafana `http://localhost:3001`
- `Connections` -> `Data sources` -> `Google Cloud Monitoring`
- Clique `Save & test`

### Exemples de metriques GCP utiles

- Firestore lectures:
  - `firestore.googleapis.com/document/read_count`
- Firestore ecritures:
  - `firestore.googleapis.com/document/write_count`
- Firestore suppressions:
  - `firestore.googleapis.com/document/delete_count`
