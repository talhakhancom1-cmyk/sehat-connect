#!/bin/bash
export $(grep -v '^#' /opt/sehat-connect/backend/.env 2>/dev/null | xargs 2>/dev/null)
ADMIN_PASS=$(grep ADMIN_PASSWORD /opt/sehat-connect/backend/.env | cut -d= -f2)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"admin@sehat.local\",\"password\":\"$ADMIN_PASS\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
CONV_ID=$(sudo -u postgres psql -d sehat_connect -t -c "SELECT id FROM conversations WHERE status='active' LIMIT 1;" 2>/dev/null | tr -d ' \n')
echo "Testing GET /api/conversations/$CONV_ID"
curl -s "http://localhost:3000/api/conversations/$CONV_ID" -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("OK" if "id" in d else "FAIL: "+str(d))'
echo "---"
echo "Testing GET /api/messages?conversation_id=$CONV_ID"
curl -s "http://localhost:3000/api/messages?conversation_id=$CONV_ID" -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(f"OK - {len(d)} messages" if isinstance(d, list) else "FAIL: "+str(d))'
echo "---"
# Check if the frontend can reach the API externally
echo "Testing external API access..."
curl -s "https://afridiwins.online/api/conversations/$CONV_ID" -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("External OK" if "id" in d else "External FAIL: "+str(d))'
