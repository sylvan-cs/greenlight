-- Add user preference columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS flexibility_minutes integer DEFAULT 60;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS course_radius_miles integer DEFAULT 25;

-- Add lat/lng columns to courses for radius matching
ALTER TABLE courses ADD COLUMN IF NOT EXISTS lat decimal(9,6);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS lng decimal(9,6);

-- Populate coordinates for known courses
UPDATE courses SET lat = 37.4571, lng = -122.1080 WHERE slug = 'baylands' OR name = 'Baylands Golf Links';
UPDATE courses SET lat = 38.6168, lng = -122.8719 WHERE slug = 'healdsburg' OR name = 'Healdsburg Golf Club';
UPDATE courses SET lat = 37.4089, lng = -122.0631 WHERE slug = 'moffett-field' OR name = 'Moffett Field Golf Club';
UPDATE courses SET lat = 37.4272, lng = -122.0819 WHERE slug = 'shoreline' OR name = 'Shoreline Golf Links';
UPDATE courses SET lat = 38.5474, lng = -122.8180 WHERE slug = 'windsor' OR name = 'Windsor Golf Club';

-- Fix booking URLs for Essex County TeeItUp courses
UPDATE courses SET booking_url = 'https://essex-county-golf.book.teeitup.golf'
WHERE slug IN ('francis-byrne', 'hendricks-field', 'weequahic');

-- Fix Galloping Hill booking URL
UPDATE courses SET booking_url = 'https://www.gallopinghillgolfcourse.com/request-tt/'
WHERE slug = 'galloping-hill';
