-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "originalPath" TEXT,
    "originalName" TEXT,
    "convertedPdfPath" TEXT,
    "finalPdfPath" TEXT,
    "originalHash" TEXT,
    "finalHash" TEXT,
    "signatureMethod" TEXT NOT NULL DEFAULT 'IMAGE',
    "digitallySigned" BOOLEAN NOT NULL DEFAULT false,
    "profileId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "signatureGroupId" TEXT,
    "approvalMode" TEXT NOT NULL DEFAULT 'SEQUENTIAL',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dueDate" DATETIME,
    "notes" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "Document_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_signatureGroupId_fkey" FOREIGN KEY ("signatureGroupId") REFERENCES "SignatureGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("approvalMode", "completedAt", "convertedPdfPath", "createdAt", "description", "digitallySigned", "finalHash", "finalPdfPath", "id", "originalHash", "originalName", "originalPath", "parentId", "profileId", "signatureGroupId", "signatureMethod", "status", "title", "updatedAt", "uploadedById", "version") SELECT "approvalMode", "completedAt", "convertedPdfPath", "createdAt", "description", "digitallySigned", "finalHash", "finalPdfPath", "id", "originalHash", "originalName", "originalPath", "parentId", "profileId", "signatureGroupId", "signatureMethod", "status", "title", "updatedAt", "uploadedById", "version" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "signatureImg" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "outOfOffice" BOOLEAN NOT NULL DEFAULT false,
    "delegateToId" TEXT,
    "pushToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLoginAt" DATETIME,
    "department" TEXT,
    "designation" TEXT,
    "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
    "roleId" TEXT,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_delegateToId_fkey" FOREIGN KEY ("delegateToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "delegateToId", "email", "failedLoginCount", "fullName", "id", "isActive", "lastLoginAt", "lockedUntil", "outOfOffice", "passwordHash", "phone", "pushToken", "roleId", "signatureImg", "updatedAt", "username") SELECT "createdAt", "delegateToId", "email", "failedLoginCount", "fullName", "id", "isActive", "lastLoginAt", "lockedUntil", "outOfOffice", "passwordHash", "phone", "pushToken", "roleId", "signatureImg", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
