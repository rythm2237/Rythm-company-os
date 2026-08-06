update public.agents
set avatar_url = case agent_code
  when 'B-001' then 'https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?auto=format&fit=crop&w=640&q=85'
  when 'A-103' then 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=640&q=85'
  else avatar_url
end
where agent_code in ('B-001','A-103');
