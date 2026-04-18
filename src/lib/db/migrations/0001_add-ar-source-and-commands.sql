CREATE TABLE `port_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`engagement_id` integer NOT NULL,
	`port_id` integer NOT NULL,
	`source` text NOT NULL,
	`label` text NOT NULL,
	`template` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`port_id`) REFERENCES `ports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `port_commands_port_id_idx` ON `port_commands` (`port_id`);--> statement-breakpoint
CREATE INDEX `port_commands_engagement_id_idx` ON `port_commands` (`engagement_id`);--> statement-breakpoint
ALTER TABLE `port_scripts` ADD `source` text DEFAULT 'nmap' NOT NULL;