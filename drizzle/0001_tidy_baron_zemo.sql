CREATE TABLE `ai_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`summary` text,
	`recommendations` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_summaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_summaries_sessionId_unique` UNIQUE(`sessionId`)
);
--> statement-breakpoint
CREATE TABLE `analysis_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`shareToken` varchar(64),
	`mode` enum('standard','private') NOT NULL DEFAULT 'standard',
	`status` enum('pending','processing','complete','error') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analysis_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `analysis_sessions_shareToken_unique` UNIQUE(`shareToken`)
);
--> statement-breakpoint
CREATE TABLE `cost_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`name` varchar(128) NOT NULL,
	`pricePerCartridge` float,
	`yieldPages` int,
	`coveragePercent` float DEFAULT 5,
	`pricePerMl` float,
	`mlPerCartridge` float,
	`paperCostPerSheet` float DEFAULT 0.01,
	`isDuplex` boolean DEFAULT false,
	`isBuiltIn` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cost_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `page_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`sessionId` int NOT NULL,
	`pageNumber` int NOT NULL,
	`cCoverage` float DEFAULT 0,
	`mCoverage` float DEFAULT 0,
	`yCoverage` float DEFAULT 0,
	`kCoverage` float DEFAULT 0,
	`tac` float DEFAULT 0,
	`totalPixels` int DEFAULT 0,
	`inkPixels` int DEFAULT 0,
	`thumbnailKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `page_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paper_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`widthMm` float NOT NULL,
	`heightMm` float NOT NULL,
	`isBuiltIn` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paper_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `uploaded_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`filename` varchar(512) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`storageKey` varchar(512),
	`fileSize` int,
	`pageCount` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `uploaded_files_id` PRIMARY KEY(`id`)
);
