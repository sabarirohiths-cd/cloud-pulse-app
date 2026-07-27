import jwt
from datetime import datetime, timedelta
from app.core.config import settings

class NotifierService:
    def generate_override_token(self, native_id: str, action: str, expires_in_minutes: int = 120) -> str:
        payload = {
            "native_id": native_id,
            "action": action,
            "exp": datetime.utcnow() + timedelta(minutes=expires_in_minutes)
        }
        return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

    def decode_override_token(self, token: str) -> dict:
        try:
            return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            raise ValueError("Token has expired.")
        except jwt.InvalidTokenError:
            raise ValueError("Invalid token.")

    async def send_pre_shutdown_warning(self, native_id: str, resource_type: str, account_name: str, scheduled_time: str, recipient_email: str = None):
        """Pre-shutdown warning notification generator."""
        extend_token = self.generate_override_token(native_id, "EXTENDED")
        skip_token = self.generate_override_token(native_id, "SKIPPED")
        
        base_url = "http://127.0.0.1:8000/api/v1/control/actions"
        extend_url = f"{base_url}?token={extend_token}"
        skip_url = f"{base_url}?token={skip_token}"
        
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; background-color: #121214; color: #e4e4e7; padding: 20px;">
                <h2>⚠️ CloudPulse Pre-Shutdown Notice</h2>
                <p>Resource <strong>{native_id}</strong> ({resource_type.upper()}) in account <strong>{account_name}</strong> is scheduled to shutdown at <strong>{scheduled_time}</strong>.</p>
                <p>If you are still working, click a button below to delay or skip this automatic shutdown:</p>
                <div style="margin-top: 20px;">
                    <a href="{extend_url}" style="background-color: #2563eb; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; margin-right: 10px;">Extend 2 Hours</a>
                    <a href="{skip_url}" style="background-color: #4b5563; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px;">Skip Shutdown Today</a>
                </div>
            </body>
        </html>
        """
        # Return generated URLs / content for integration
        return {"extend_url": extend_url, "skip_url": skip_url, "html": html_content}

notifier_service = NotifierService()
