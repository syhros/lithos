import { useEffect, useState } from 'react';
import { useFinance } from '../context/FinanceContext';

export const useInitialDataLoad = () => {
  const { refreshData } = useFinance();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        await refreshData();
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [refreshData]);

  return { isLoading };
};
