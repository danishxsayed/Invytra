-- Search imports saved LinkedIn's connection degree as part of the name ("Kenny Stewart • 3rd+").
UPDATE leads SET last_name = NULLIF(regexp_replace(last_name, '\s*[•·]\s*(1st|2nd|3rd\+?)(\s+degree(\s+connection)?)?\s*$', '', 'i'), '')
  WHERE last_name ~* '[•·]\s*(1st|2nd|3rd)';
UPDATE leads SET first_name = NULLIF(regexp_replace(first_name, '\s*[•·]\s*(1st|2nd|3rd\+?)(\s+degree(\s+connection)?)?\s*$', '', 'i'), '')
  WHERE first_name ~* '[•·]\s*(1st|2nd|3rd)';
UPDATE campaign_leads SET last_name = NULLIF(regexp_replace(last_name, '\s*[•·]\s*(1st|2nd|3rd\+?)(\s+degree(\s+connection)?)?\s*$', '', 'i'), '')
  WHERE last_name ~* '[•·]\s*(1st|2nd|3rd)';
UPDATE campaign_leads SET first_name = NULLIF(regexp_replace(first_name, '\s*[•·]\s*(1st|2nd|3rd\+?)(\s+degree(\s+connection)?)?\s*$', '', 'i'), '')
  WHERE first_name ~* '[•·]\s*(1st|2nd|3rd)';
UPDATE campaign_leads SET linkedin_name = NULLIF(regexp_replace(linkedin_name, '\s*[•·]\s*(1st|2nd|3rd\+?)(\s+degree(\s+connection)?)?\s*$', '', 'i'), '')
  WHERE linkedin_name ~* '[•·]\s*(1st|2nd|3rd)';
