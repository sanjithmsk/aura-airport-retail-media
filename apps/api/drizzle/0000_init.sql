CREATE TABLE `airlines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`home` integer NOT NULL,
	`premium` real NOT NULL,
	`colour` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaign_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`campaign_id` text NOT NULL,
	`advertiser` text NOT NULL,
	`impressions` integer NOT NULL,
	`scans` integer NOT NULL,
	`redemptions` integer NOT NULL,
	`spend` real NOT NULL,
	`revenue` real NOT NULL,
	`plays` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_day_unique` ON `campaign_days` (`date`,`campaign_id`);--> statement-breakpoint
CREATE INDEX `campaign_days_date_idx` ON `campaign_days` (`date`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`advertiser` text NOT NULL,
	`outlet_id` text,
	`airline_code` text,
	`category` text NOT NULL,
	`weights` text NOT NULL,
	`hard` text NOT NULL,
	`triggers` text NOT NULL,
	`budget` real NOT NULL,
	`spent` real DEFAULT 0 NOT NULL,
	`cpm` real NOT NULL,
	`cvr_index` real DEFAULT 1 NOT NULL,
	`creative_id` text,
	`promo_id` text,
	`priority` integer DEFAULT 1 NOT NULL,
	`schedule_from` text NOT NULL,
	`schedule_to` text NOT NULL,
	`status` text DEFAULT 'live' NOT NULL,
	`approval` text DEFAULT 'approved' NOT NULL,
	`brand_safety` text DEFAULT 'passed' NOT NULL,
	`frequency_cap` integer DEFAULT 4 NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`pin_reason` text
);
--> statement-breakpoint
CREATE TABLE `creatives` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text,
	`advertiser` text NOT NULL,
	`category` text NOT NULL,
	`template` text NOT NULL,
	`headline` text NOT NULL,
	`sub` text NOT NULL,
	`cta` text NOT NULL,
	`ratio` text NOT NULL,
	`approval` text DEFAULT 'pending' NOT NULL,
	`generated_by` text DEFAULT 'studio' NOT NULL,
	`brief` text,
	`updated` text NOT NULL,
	`checks` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decision_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`screen_id` text NOT NULL,
	`at` integer NOT NULL,
	`crowd_now` integer NOT NULL,
	`dwell_median` integer NOT NULL,
	`max_delay` integer NOT NULL,
	`winner_id` text,
	`winner_score` real,
	`rule` text NOT NULL,
	`fallback` integer DEFAULT false NOT NULL,
	`model_version` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `decision_at_idx` ON `decision_log` (`at`);--> statement-breakpoint
CREATE INDEX `decision_screen_at_idx` ON `decision_log` (`screen_id`,`at`);--> statement-breakpoint
CREATE TABLE `flight_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flight_id` text NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `flight_events_at_idx` ON `flight_events` (`at`);--> statement-breakpoint
CREATE TABLE `flights` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`airline_code` text NOT NULL,
	`direction` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`terminal` text NOT NULL,
	`gate_id` text NOT NULL,
	`stand` text NOT NULL,
	`belt` text,
	`checkin` text,
	`std_ts` integer NOT NULL,
	`etd_ts` integer NOT NULL,
	`atd_ts` integer,
	`sched_boarding_ts` integer NOT NULL,
	`boarding_ts` integer NOT NULL,
	`gate_close_ts` integer NOT NULL,
	`delay_min` integer DEFAULT 0 NOT NULL,
	`delay_code` text,
	`status` text NOT NULL,
	`pax` integer NOT NULL,
	`ac_type` text NOT NULL,
	`ac_reg` text NOT NULL,
	`load_factor` real NOT NULL,
	`tobt` integer,
	`tsat` integer,
	`aibt` integer,
	`aobt` integer,
	`profile` text NOT NULL,
	FOREIGN KEY (`airline_code`) REFERENCES `airlines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `flights_gate_idx` ON `flights` (`gate_id`);--> statement-breakpoint
CREATE INDEX `flights_std_idx` ON `flights` (`std_ts`);--> statement-breakpoint
CREATE INDEX `flights_airline_idx` ON `flights` (`airline_code`);--> statement-breakpoint
CREATE TABLE `gates` (
	`id` text PRIMARY KEY NOT NULL,
	`zone_id` text NOT NULL,
	`terminal` text NOT NULL,
	`intl` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`stand` text NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gates_zone_idx` ON `gates` (`zone_id`);--> statement-breakpoint
CREATE TABLE `impressions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`screen_id` text NOT NULL,
	`at` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `impressions_campaign_at_idx` ON `impressions` (`campaign_id`,`at`);--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`severity` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`owner` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `incidents_at_idx` ON `incidents` (`at`);--> statement-breakpoint
CREATE TABLE `outlets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`zone_id` text NOT NULL,
	`terminal` text NOT NULL,
	`near_gates` text NOT NULL,
	`unit` text NOT NULL,
	`sqm` integer NOT NULL,
	`opens` text NOT NULL,
	`closes` text NOT NULL,
	`contact` text NOT NULL,
	`monthly_rent` integer NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `outlets_zone_idx` ON `outlets` (`zone_id`);--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`advertiser` text NOT NULL,
	`outlet_id` text,
	`code` text NOT NULL,
	`offer` text NOT NULL,
	`valid_until` text NOT NULL,
	`max_redemptions` integer NOT NULL,
	`redemptions` integer DEFAULT 0 NOT NULL,
	`share_enabled` integer DEFAULT true NOT NULL,
	`stock_paused` integer DEFAULT false NOT NULL,
	`terms` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_code_unique` ON `promo_codes` (`code`);--> statement-breakpoint
CREATE TABLE `queue_measurements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`zone_id` text NOT NULL,
	`people` integer NOT NULL,
	`wait_sec` integer NOT NULL,
	`at` integer NOT NULL,
	`raw` text NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `queue_zone_at_idx` ON `queue_measurements` (`zone_id`,`at`);--> statement-breakpoint
CREATE TABLE `redemptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`campaign_id` text NOT NULL,
	`screen_id` text,
	`advertiser` text NOT NULL,
	`outlet_id` text,
	`value` real NOT NULL,
	`segment` text NOT NULL,
	`code` text NOT NULL,
	`via` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `redemptions_at_idx` ON `redemptions` (`at`);--> statement-breakpoint
CREATE TABLE `screens` (
	`id` text PRIMARY KEY NOT NULL,
	`zone_id` text NOT NULL,
	`terminal` text NOT NULL,
	`name` text NOT NULL,
	`size` text NOT NULL,
	`orientation` text NOT NULL,
	`ratio` text NOT NULL,
	`kind` text NOT NULL,
	`near_gates` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`status` text DEFAULT 'online' NOT NULL,
	`latency_ms` integer DEFAULT 60 NOT NULL,
	`offline_since` integer,
	`installed` text NOT NULL,
	`vendor_id` text,
	`floor_price` real NOT NULL,
	`plays_today` integer DEFAULT 0 NOT NULL,
	`impressions_today` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `screens_zone_idx` ON `screens` (`zone_id`);--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`contact` text NOT NULL,
	`sla` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `zones` (
	`id` text PRIMARY KEY NOT NULL,
	`terminal` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`w` real NOT NULL,
	`h` real NOT NULL
);
