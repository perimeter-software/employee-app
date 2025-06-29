import { useEffect, useRef, useState, RefObject } from 'react';

interface UseStickyHeaderOptions {
  scrollContainerRef: RefObject<HTMLElement>;
  headerRef: RefObject<HTMLElement>;
  offset?: number; // Offset from top (for main page header)
}

export function useStickyHeader({
  scrollContainerRef,
  headerRef,
  offset = 0,
}: UseStickyHeaderOptions) {
  const [isSticky, setIsSticky] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const originalHeaderRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const header = headerRef.current;

    if (!scrollContainer || !header) return;

    // Store original header reference
    if (!originalHeaderRef.current) {
      originalHeaderRef.current = header;
    }

    // Get header height
    const updateHeaderHeight = () => {
      setHeaderHeight(header.offsetHeight);
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const shouldBeSticky = scrollTop > offset;

      if (shouldBeSticky !== isSticky) {
        setIsSticky(shouldBeSticky);

        if (shouldBeSticky) {
          // Make header sticky
          header.style.position = 'fixed';
          header.style.top = `${offset}px`;
          header.style.left = `${scrollContainer.getBoundingClientRect().left}px`;
          header.style.width = `${scrollContainer.offsetWidth}px`;
          header.style.zIndex = '1000';
          header.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';

          // Add placeholder to maintain layout
          const placeholder = document.createElement('div');
          placeholder.id = 'sticky-header-placeholder';
          placeholder.style.height = `${header.offsetHeight}px`;
          placeholder.style.width = '100%';
          header.parentNode?.insertBefore(placeholder, header.nextSibling);
        } else {
          // Remove sticky behavior
          header.style.position = '';
          header.style.top = '';
          header.style.left = '';
          header.style.width = '';
          header.style.zIndex = '';
          header.style.boxShadow = '';

          // Remove placeholder
          const placeholder = document.getElementById(
            'sticky-header-placeholder'
          );
          if (placeholder) {
            placeholder.remove();
          }
        }
      }
    };

    // Handle window resize to update header position
    const handleResize = () => {
      if (isSticky && header) {
        const scrollContainer = scrollContainerRef.current;
        if (scrollContainer) {
          header.style.left = `${scrollContainer.getBoundingClientRect().left}px`;
          header.style.width = `${scrollContainer.offsetWidth}px`;
        }
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('resize', updateHeaderHeight);

      // Reset header styles
      if (header) {
        header.style.position = '';
        header.style.top = '';
        header.style.left = '';
        header.style.width = '';
        header.style.zIndex = '';
        header.style.boxShadow = '';
      }

      // Remove placeholder if exists
      const placeholder = document.getElementById('sticky-header-placeholder');
      if (placeholder) {
        placeholder.remove();
      }
    };
  }, [scrollContainerRef, headerRef, offset, isSticky]);

  return { isSticky, headerHeight };
}
