import { useQuery } from '@tanstack/react-query';

const fetchPollData = async () => {
  const res = await fetch('/api/poll');
  return res.json();
};

export const usePollData = () => {
  return useQuery({
    queryKey: ['poll'],
    queryFn: fetchPollData,
    refetchInterval: 5000, // 5s polling
  });
};