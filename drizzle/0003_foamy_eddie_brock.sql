ALTER TABLE `cost_presets` ADD `cCartridgePrice` float;--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `cCartridgeYield` int;--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `mCartridgePrice` float;--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `mCartridgeYield` int;--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `yCartridgePrice` float;--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `yCartridgeYield` int;--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `kCartridgePrice` float;--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `kCartridgeYield` int;--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `brand` varchar(32);--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `cartridgeModel` varchar(64);--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `cartridgeType` varchar(16);--> statement-breakpoint
ALTER TABLE `cost_presets` ADD `compatiblePrinters` text;