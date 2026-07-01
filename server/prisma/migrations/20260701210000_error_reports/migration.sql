-- Auto bug-reporting: captured server/client errors for later debugging.
CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "url" TEXT,
    "method" TEXT,
    "status" INTEGER,
    "userId" TEXT,
    "userEmail" TEXT,
    "userAgent" TEXT,
    "appVersion" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ErrorReport_resolved_createdAt_idx" ON "ErrorReport"("resolved", "createdAt");
