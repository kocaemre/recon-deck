CREATE TABLE `check_states` (
	`engagement_id` integer NOT NULL,
	`port_id` integer NOT NULL,
	`check_key` text NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`engagement_id`, `port_id`, `check_key`),
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`port_id`) REFERENCES `ports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `engagements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target_ip` text NOT NULL,
	`target_hostname` text,
	`source` text NOT NULL,
	`scanned_at` text,
	`os_name` text,
	`os_accuracy` integer,
	`raw_input` text NOT NULL,
	`warnings_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `engagements_created_at_idx` ON `engagements` (`created_at`);--> statement-breakpoint
CREATE TABLE `port_notes` (
	`engagement_id` integer NOT NULL,
	`port_id` integer NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`engagement_id`, `port_id`),
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`port_id`) REFERENCES `ports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `port_scripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`engagement_id` integer NOT NULL,
	`port_id` integer,
	`script_id` text NOT NULL,
	`output` text NOT NULL,
	`is_host_script` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`port_id`) REFERENCES `ports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `port_scripts_port_id_idx` ON `port_scripts` (`port_id`);--> statement-breakpoint
CREATE INDEX `port_scripts_engagement_id_idx` ON `port_scripts` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `ports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`engagement_id` integer NOT NULL,
	`port` integer NOT NULL,
	`protocol` text NOT NULL,
	`state` text NOT NULL,
	`service` text,
	`product` text,
	`version` text,
	`tunnel` text,
	`extrainfo` text,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ports_engagement_id_idx` ON `ports` (`engagement_id`);