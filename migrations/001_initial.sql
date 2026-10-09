-- SafeTap initial schema; select your database before executing.
CREATE TABLE IF NOT EXISTS app_lock (id INT PRIMARY KEY) ENGINE=InnoDB;

INSERT IGNORE INTO app_lock (id) VALUES (1);

CREATE TABLE IF NOT EXISTS `users` (`id` VARCHAR(191) PRIMARY KEY, `name` VARCHAR(191), `username` VARCHAR(191), `passwordHash` VARCHAR(200), `role` VARCHAR(40), `blockIds` JSON, `active` BOOLEAN, UNIQUE KEY (`username`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `blocks` (`id` VARCHAR(191) PRIMARY KEY, `program` VARCHAR(40), `code` VARCHAR(40), `term` VARCHAR(191), UNIQUE KEY (`program`,`code`,`term`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `rooms` (`id` VARCHAR(191) PRIMARY KEY, `name` VARCHAR(191), `floor` INT, `monitored` BOOLEAN, `position` INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `students` (`id` VARCHAR(191) PRIMARY KEY, `studentNumber` VARCHAR(191), `name` VARCHAR(191), `blockId` VARCHAR(191), `nfcUid` VARCHAR(191), `qrToken` VARCHAR(191), `active` BOOLEAN, UNIQUE KEY (`studentNumber`), UNIQUE KEY (`nfcUid`), UNIQUE KEY (`qrToken`), FOREIGN KEY (`blockId`) REFERENCES `blocks` (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `classes` (`id` VARCHAR(191) PRIMARY KEY, `blockId` VARCHAR(191), `roomId` VARCHAR(191), `date` VARCHAR(40), `status` VARCHAR(40), `openedAt` VARCHAR(40), `updatedAt` VARCHAR(40), `userId` VARCHAR(191), FOREIGN KEY (`blockId`) REFERENCES `blocks` (`id`), FOREIGN KEY (`roomId`) REFERENCES `rooms` (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `attendance` (`id` VARCHAR(191) PRIMARY KEY, `classId` VARCHAR(191), `studentId` VARCHAR(191), `present` BOOLEAN, `updatedAt` VARCHAR(40), UNIQUE KEY (`classId`,`studentId`), FOREIGN KEY (`classId`) REFERENCES `classes` (`id`), FOREIGN KEY (`studentId`) REFERENCES `students` (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `events` (`id` VARCHAR(191) PRIMARY KEY, `name` VARCHAR(191), `area` VARCHAR(191), `type` VARCHAR(40), `status` VARCHAR(40), `startedAt` VARCHAR(40), `endedAt` VARCHAR(40), `createdBy` VARCHAR(191), `coverage` JSON) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `participants` (`id` VARCHAR(191) PRIMARY KEY, `eventId` VARCHAR(191), `studentId` VARCHAR(191), `studentNumber` VARCHAR(191), `name` VARCHAR(191), `blockId` VARCHAR(191), `blockLabel` VARCHAR(191), `program` VARCHAR(40), `term` VARCHAR(191), `roomId` VARCHAR(191), `roomName` VARCHAR(191), `floor` INT, `expected` BOOLEAN, UNIQUE KEY (`eventId`,`studentId`), FOREIGN KEY (`eventId`) REFERENCES `events` (`id`), FOREIGN KEY (`studentId`) REFERENCES `students` (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `checkins` (`id` VARCHAR(191) PRIMARY KEY, `eventId` VARCHAR(191), `studentId` VARCHAR(191), `userId` VARCHAR(191), `actor` VARCHAR(191), `method` VARCHAR(40), `capturedAt` VARCHAR(40), `receivedAt` VARCHAR(40), `status` VARCHAR(40), `reason` TEXT, UNIQUE KEY (`eventId`,`studentId`), FOREIGN KEY (`eventId`) REFERENCES `events` (`id`), FOREIGN KEY (`studentId`) REFERENCES `students` (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `submissions` (`id` VARCHAR(191) PRIMARY KEY, `userId` VARCHAR(191), `eventId` VARCHAR(191), `result` JSON, `receivedAt` VARCHAR(40), FOREIGN KEY (`eventId`) REFERENCES `events` (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `audit` (`id` VARCHAR(191) PRIMARY KEY, `userId` VARCHAR(191), `actor` VARCHAR(191), `action` VARCHAR(191), `detail` TEXT, `time` VARCHAR(40)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
