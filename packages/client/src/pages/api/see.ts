import { useEffect, useState } from 'react';

export const useSSE = (url: string) => {
  const [data, setData] = useState<string>();

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onmessage = (e) => {
      setData(e.data);
    };

    return () => eventSource.close();
  }, [url]);

  return { data };
};