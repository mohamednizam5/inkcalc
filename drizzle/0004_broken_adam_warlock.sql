CREATE TABLE `printers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`brand` varchar(32) NOT NULL,
	`series` varchar(64),
	`model` varchar(128) NOT NULL,
	`presetId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `printers_id` PRIMARY KEY(`id`)
);
