-- Add device (user-agent) capture to the audit log. Not part of the hash chain.
ALTER TABLE "AuditLog" ADD COLUMN "device" TEXT;
