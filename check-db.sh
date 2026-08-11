#!/bin/bash
# Test the waiting room API flow on afridiwins
cd /opt/sehat-connect/backend

# Get env vars
export $(grep -v '^#' .env 2>/dev/null | xargs 2>/dev/null)

echo "=== Step 1: Login as patient (Salar Khan) ==="
# First, find a patient user
PATIENT_EMAIL=$(sudo -u postgres psql -d sehat_connect -t -c "SELECT email FROM users WHERE role='patient' LIMIT 1;" | tr -d ' \n')
echo "Patient email: $PATIENT_EMAIL"

# We can't login without the password. Let's check the conversation -> appointment flow directly.
echo ""
echo "=== Step 2: Check conversation -> appointment_id flow ==="
sudo -u postgres psql -d sehat_connect -c "
SELECT c.id as conv_id, c.appointment_id, 
       a.id as appt_id,
       a.appointment_date,
       a.time_slot,
       a.status,
       u.email as patient_email,
       u.role as patient_role
FROM conversations c
JOIN appointments a ON c.appointment_id = a.id::text
JOIN users u ON c.patient_id = u.id::text
ORDER BY c.created_at DESC LIMIT 5;
"

echo ""
echo "=== Step 3: Check if appointment_id types match ==="
echo "Conversation.appointment_id type:"
sudo -u postgres psql -d sehat_connect -t -c "SELECT data_type FROM information_schema.columns WHERE table_name='conversations' AND column_name='appointment_id';"
echo "Appointment.id type:"
sudo -u postgres psql -d sehat_connect -t -c "SELECT data_type FROM information_schema.columns WHERE table_name='appointments' AND column_name='id';"

echo ""
echo "=== Step 4: Test the actual API call (appointment GET) ==="
# Get a valid patient token by checking the sessions table
TOKEN=$(sudo -u postgres psql -d sehat_connect -t -c "SELECT token FROM sessions ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | tr -d ' \n')
if [ -z "$TOKEN" ]; then
  echo "No token in sessions table, trying to login..."
  # Try to login with admin
  ADMIN_EMAIL=$(grep ADMIN_EMAIL .env 2>/dev/null | cut -d= -f2)
  ADMIN_PASS=$(grep ADMIN_PASSWORD .env 2>/dev/null | cut -d= -f2)
  echo "Admin email: $ADMIN_EMAIL"
  TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
fi

if [ -n "$TOKEN" ]; then
  echo "Got token, testing appointment API..."
  APPT_ID=$(sudo -u postgres psql -d sehat_connect -t -c "SELECT appointment_id FROM conversations WHERE appointment_id IS NOT NULL LIMIT 1;" | tr -d ' \n')
  echo "Fetching appointment: $APPT_ID"
  curl -s http://localhost:3000/api/appointments/$APPT_ID -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null || echo "API call failed"
else
  echo "Could not get a token"
fi
