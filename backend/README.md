# Sehat Connect Backend - VPS Deployment Guide

This backend API has been converted from Base44 entities to a Node.js/Express/MongoDB backend ready for VPS deployment.

## 🏗️ Architecture

- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Process Manager**: PM2
- **Web Server**: Nginx (reverse proxy)
- **Platform**: Node.js 18+

## 📋 Prerequisites

- Node.js 18+ and npm
- MongoDB 4.4+
- PM2 (Process Manager)
- Nginx (for reverse proxy)
- SSL Certificate (Let's Encrypt recommended)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp env.example .env
# Edit .env with your configuration
```

### 3. Setup Database

Make sure MongoDB is running and update the `MONGODB_URI` in your `.env` file.

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## 🌐 VPS Deployment

### Manual Deployment Steps

#### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Install Nginx
sudo apt install -y nginx

# Install PM2
sudo npm install -g pm2
```

#### 2. Deploy Application

```bash
# Clone repository
git clone <your-repo-url>
cd sehat-connect-ech- for devine/backend

# Install dependencies
npm install --production

# Setup environment
cp env.example .env
nano .env  # Update with your configuration

# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### 3. Configure Nginx

```bash
# Copy nginx configuration
sudo cp nginx.conf /etc/nginx/sites-available/sehat-connect

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/sehat-connect /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

#### 4. Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

### Automated Deployment

Run the deployment script:

```bash
chmod +x deploy.sh
./deploy.sh
```

## 📡 API Endpoints

### Core Endpoints

- `GET /health` - Health check
- `GET /api/appointments` - Get all appointments
- `POST /api/appointments` - Create appointment
- `GET /api/doctors` - Get all doctors
- `POST /api/doctors` - Create doctor
- `GET /api/users` - Get all users
- `POST /api/users` - Create user
- `GET /api/medical-records` - Get medical records
- `POST /api/medical-records` - Create medical record

### Custom Functions

- `POST /api/functions/getFamilySharedData` - Get delegated family data
- `POST /api/functions/verifyHealthCardToken` - Verify health card token

### Additional Endpoints

All entity types have standard CRUD endpoints:
- `GET /api/{entity}` - List all
- `GET /api/{entity}/:id` - Get by ID
- `POST /api/{entity}` - Create
- `PUT /api/{entity}/:id` - Update
- `DELETE /api/{entity}/:id` - Delete

Available entities:
- appointments, audit-events, consents, conversations, doctors
- encounters, health-cards, health-card-tokens, households
- medical-records, medication-plans, messages, notifications
- payments, prescriptions, users

## 🔧 Configuration

### Environment Variables

See `env.example` for all available configuration options:

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT secret key (if using auth)
- `CORS_ORIGIN` - CORS allowed origins

### Database Models

All Base44 entities have been converted to Mongoose models:
- Appointment, AuditEvent, Consent, Conversation, ConversationMember
- CountryConfig, Delegation, Discontinuation, Doctor, DoseEvent
- EmergencyContact, Encounter, HealthCard, HealthCardToken
- Household, HouseholdMember, MedicalRecord, MedicationPlan
- Message, MessageReceipt, Notification, Payment, Prescription
- Review, Schedule, TrackingConfig, User

## 📊 Monitoring

### PM2 Commands

```bash
pm2 list                    # List all processes
pm2 monit                   # Monitor CPU and memory
pm2 logs sehat-connect-backend  # View logs
pm2 restart sehat-connect-backend  # Restart
pm2 stop sehat-connect-backend     # Stop
pm2 delete sehat-connect-backend   # Remove from PM2
```

### Nginx Logs

```bash
sudo tail -f /var/log/nginx/sehat-connect-access.log
sudo tail -f /var/log/nginx/sehat-connect-error.log
```

## 🔒 Security Considerations

1. **Environment Variables**: Never commit `.env` file
2. **MongoDB Authentication**: Enable MongoDB authentication in production
3. **SSL/TLS**: Always use HTTPS in production
4. **Rate Limiting**: Consider adding rate limiting middleware
5. **Input Validation**: Add validation middleware for user inputs
6. **CORS**: Configure CORS properly for your frontend domain
7. **Security Headers**: Nginx config includes basic security headers

## 🔄 Updates and Maintenance

### Update Application

```bash
cd /path/to/backend
git pull
npm install --production
pm2 restart sehat-connect-backend
```

### Database Backup

```bash
# Backup
mongodump --uri="mongodb://localhost:27017/sehat-connect" --out /backup/path

# Restore
mongorestore --uri="mongodb://localhost:27017/sehat-connect" /backup/path
```

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check MongoDB is running: `sudo systemctl status mongod`
   - Verify connection string in `.env`

2. **Port Already in Use**
   - Change PORT in `.env` or stop conflicting service

3. **PM2 Process Not Starting**
   - Check logs: `pm2 logs sehat-connect-backend`
   - Verify Node.js version: `node --version`

4. **Nginx 502 Bad Gateway**
   - Check if backend is running: `pm2 list`
   - Verify backend port matches Nginx config

## 📞 Support

For issues related to:
- **Base44 Integration**: Check Base44 documentation
- **MongoDB**: Check MongoDB documentation
- **Nginx**: Check Nginx documentation
- **PM2**: Check PM2 documentation

## 📝 License

This backend is part of the Sehat Connect project.
