-- Messages saved from inbox snippets kept a sender prefix when it was a longer part of the
-- person's name ("Mohammed Tahur: Hi …" for Mohammed Tahur Sayed). Strip it, keeping keys
-- in step with the worker's md5("<0|1>|<text>|<n>").
CREATE TEMP TABLE cleaned AS
SELECT m.id, m.conversation_id, m.from_me,
       btrim(regexp_replace(substr(m.text, length(split_part(m.text, ': ', 1)) + 3), '\s+', ' ', 'g')) AS body
FROM conversation_messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE position(': ' in m.text) > 0
  AND length(split_part(m.text, ': ', 1)) BETWEEN 2 AND 60
  AND (lower(split_part(m.text, ': ', 1)) = 'you'
       OR lower(c.participant_name) = lower(split_part(m.text, ': ', 1))
       OR lower(c.participant_name) LIKE lower(split_part(m.text, ': ', 1)) || ' %');

-- Already there without the prefix: drop the prefixed copy.
DELETE FROM conversation_messages m USING cleaned x
WHERE m.id = x.id AND EXISTS (
  SELECT 1 FROM conversation_messages o
  WHERE o.conversation_id = x.conversation_id AND o.id <> x.id AND o.from_me = x.from_me
    AND btrim(regexp_replace(o.text, '\s+', ' ', 'g')) = x.body);

UPDATE conversation_messages m
SET text = x.body, key = md5((CASE WHEN x.from_me THEN '1' ELSE '0' END) || '|' || x.body || '|1')
FROM cleaned x
WHERE m.id = x.id
  AND NOT EXISTS (SELECT 1 FROM conversation_messages o WHERE o.conversation_id = x.conversation_id
                  AND o.key = md5((CASE WHEN x.from_me THEN '1' ELSE '0' END) || '|' || x.body || '|1'));

UPDATE conversations c
SET last_message_text = btrim(substr(c.last_message_text, length(split_part(c.last_message_text, ': ', 1)) + 3))
WHERE position(': ' in c.last_message_text) > 0
  AND length(split_part(c.last_message_text, ': ', 1)) BETWEEN 2 AND 60
  AND (lower(split_part(c.last_message_text, ': ', 1)) = 'you'
       OR lower(c.participant_name) = lower(split_part(c.last_message_text, ': ', 1))
       OR lower(c.participant_name) LIKE lower(split_part(c.last_message_text, ': ', 1)) || ' %');

DROP TABLE cleaned;
