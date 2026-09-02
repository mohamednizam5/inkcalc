# InkCalc on Oracle Cloud Always Free

This guide deploys InkCalc as a Docker application on an Oracle Cloud Always Free Ubuntu virtual machine. It keeps the existing Render service as an independent backup. InkCalc retains its existing external MySQL database, so no application schema conversion is required.

> **Recommended architecture:** Oracle VM runs the InkCalc web application and Caddy reverse proxy. The existing managed MySQL database remains external. Render remains available as a free backup at `https://inkcalc.onrender.com`.

## 1. Create the Oracle Always Free VM

Create an Oracle Cloud account and open **Compute → Instances → Create instance**. Choose an **Ubuntu 24.04** image and an **Always Free eligible** shape. An Ampere A1 Flexible shape is preferred when available because PDF rasterisation and image analysis benefit from more memory. Keep the total allocation within the Always Free quota shown in the Oracle console.

If the selected region has no Always Free capacity, try an alternative availability domain, a smaller shape, or another nearby home region. Do not create a paid shape unless you deliberately want to pay for it.

Create and securely store an SSH key pair. Restrict SSH port 22 at the Oracle network layer to your office/public IP where practical. Create ingress rules for TCP **80** and **443** from the internet so customers can access the application over HTTP/HTTPS.

## 2. Set up DNS (recommended)

Create an `A` record such as `inkcalc.sctdjm.com` that points to the VM public IPv4 address. Wait until DNS resolves before requesting HTTPS. Caddy automatically obtains and renews the TLS certificate after this record works.

You may first verify the installation over the VM public IP at HTTP port 80. Do not use IP-based HTTP as the long-term customer URL.

## 3. Connect and prepare configuration

SSH to the new machine as the Ubuntu user and clone the repository:

```bash
git clone https://github.com/mohamednizam5/inkcalc.git /opt/inkcalc
cd /opt/inkcalc
cp deploy/oracle/.env.example deploy/oracle/.env
nano deploy/oracle/.env
```

Set `DATABASE_URL` to the existing external MySQL connection URL. Do not change the database host to `localhost` unless you have deliberately installed and secured a local MySQL instance. Generate the `JWT_SECRET` on the VM:

```bash
openssl rand -hex 32
```

Paste the generated value in `deploy/oracle/.env`. Transfer the same OAuth-related values used by the current production deployment only if those features are required. Set `INKCALC_DOMAIN` to your real domain, for example:

```dotenv
INKCALC_DOMAIN=inkcalc.sctdjm.com
```

Keep the `.env` file private and never commit it to Git.

## 4. Install and run InkCalc

Run the provided script from the repository:

```bash
sudo bash scripts/oracle-install-inkcalc.sh
```

The first run installs Docker, pulls the latest `master` branch, builds the application, opens the VM firewall for SSH/HTTP/HTTPS, and starts the Caddy and InkCalc containers. The deployment becomes available after the `app` health check succeeds.

Check status and logs with:

```bash
cd /opt/inkcalc
docker compose --env-file deploy/oracle/.env -f deploy/oracle/docker-compose.yml ps
docker compose --env-file deploy/oracle/.env -f deploy/oracle/docker-compose.yml logs --tail=100
```

## 5. Verify the migration

Verify each item before announcing the Oracle URL to customers.

| Check | Expected result |
|---|---|
| `curl -I http://VM_PUBLIC_IP` | `200` or a redirect after Caddy starts |
| `curl -I https://inkcalc.sctdjm.com` | HTTPS response after DNS and certificate provisioning |
| Upload and analyse a PDF/image | CMYK/RGB coverage results complete without server error |
| Configure cartridge details | Flexible 2-cartridge, CMYK, and custom modes calculate correctly |
| Print to Empty | Limiting cartridge and safe-copy count display correctly |
| Download PDF/CSV report | Report and spreadsheet download correctly |
| Share | Native/app sharing dialogue opens where supported |

## 6. Updating InkCalc

To deploy a later GitHub commit, SSH to the VM and rerun the installer:

```bash
cd /opt/inkcalc
sudo bash scripts/oracle-install-inkcalc.sh
```

Docker Compose rebuilds the application and replaces the old container. Caddy retains its TLS certificates in a persistent Docker volume.

## 7. Backups and rollback

The web application source is in GitHub. The important persistent data is MySQL, so make a MySQL dump before changing database credentials or performing risky database changes:

```bash
mysqldump --single-transaction --routines --triggers \
  --host=MYSQL_HOST --user=INKCALC_USER --password inkcalc \
  | gzip > inkcalc-$(date +%F).sql.gz
```

Keep encrypted backups outside the VM. If the Oracle service has a problem, continue using the Render backup at `https://inkcalc.onrender.com` while troubleshooting. Because Render’s free service sleeps after inactivity, it is a backup rather than the preferred customer URL.

## Operating notes

The Oracle VM has a persistent filesystem, but uploaded source files should still be treated as temporary. InkCalc’s completed analysis data belongs in MySQL. Keep the OS patched with `sudo apt-get update && sudo apt-get upgrade`, use SSH keys rather than passwords, and restrict port 22 to known administrators whenever possible.
