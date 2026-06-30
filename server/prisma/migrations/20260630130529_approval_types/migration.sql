-- CreateTable
CREATE TABLE "ApprovalType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApprovalStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "signatoryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "actedAt" DATETIME,
    "remindedAt" DATETIME,
    "approvalTypeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalStep_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalStep_signatoryId_fkey" FOREIGN KEY ("signatoryId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApprovalStep_approvalTypeId_fkey" FOREIGN KEY ("approvalTypeId") REFERENCES "ApprovalType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalStep" ("actedAt", "comment", "createdAt", "documentId", "id", "order", "remindedAt", "signatoryId", "status") SELECT "actedAt", "comment", "createdAt", "documentId", "id", "order", "remindedAt", "signatoryId", "status" FROM "ApprovalStep";
DROP TABLE "ApprovalStep";
ALTER TABLE "new_ApprovalStep" RENAME TO "ApprovalStep";
CREATE UNIQUE INDEX "ApprovalStep_documentId_signatoryId_key" ON "ApprovalStep"("documentId", "signatoryId");
CREATE TABLE "new_SavedMark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SIGNATURE',
    "imagePath" TEXT NOT NULL,
    "posX" REAL NOT NULL DEFAULT 0.6,
    "posY" REAL NOT NULL DEFAULT 0.8,
    "width" REAL NOT NULL DEFAULT 0.24,
    "height" REAL NOT NULL DEFAULT 0.09,
    "approvalTypeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavedMark_approvalTypeId_fkey" FOREIGN KEY ("approvalTypeId") REFERENCES "ApprovalType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SavedMark" ("createdAt", "height", "id", "imagePath", "kind", "label", "posX", "posY", "userId", "width") SELECT "createdAt", "height", "id", "imagePath", "kind", "label", "posX", "posY", "userId", "width" FROM "SavedMark";
DROP TABLE "SavedMark";
ALTER TABLE "new_SavedMark" RENAME TO "SavedMark";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalType_name_key" ON "ApprovalType"("name");
