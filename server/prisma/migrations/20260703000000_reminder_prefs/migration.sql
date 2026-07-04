-- Per-user email reminder preferences for pending items.
-- reminderFreqDays: NULL = use the system default, 0 = off, N = every N days.
-- lastReminderAt: when the pending-items reminder digest was last emailed to this user.
ALTER TABLE "User" ADD COLUMN "reminderFreqDays" INTEGER;
ALTER TABLE "User" ADD COLUMN "lastReminderAt" DATETIME;
