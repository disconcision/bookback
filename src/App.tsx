import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import _ from "lodash";

interface BookmarkData {
  url: string;
  title: string;
  date: Date;
}

interface YearData {
  year: number;
  bookmarks: BookmarkData[];
}

interface ControlPanelProps {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  dayRange: number;
  setDayRange: (range: number) => void;
  entriesPerYear: number;
  setEntriesPerYear: (num: number) => void;
  chronological: boolean;
  setChronological: (isChron: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchAll: boolean;
  setSearchAll: (all: boolean) => void;
}

interface BookmarkEntryProps {
  bookmark: BookmarkData;
  year?: number;
  showYear?: boolean;
  remainingCount?: number;
  onToggle?: () => void;
}

const extractDomain = (url: string): string => {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split(".");
    if (parts.length > 2) {
      parts.shift();
    }
    return parts.join(".");
  } catch {
    return "";
  }
};

const cleanUrl = (url: string): string => {
  if (url.startsWith("http")) return url;

  const patterns = [
    /chrome-extension:\/\/[a-zA-Z0-9]+\/suspended\.html#ttl=[^&]*&uri=/,
    /chrome-extension:\/\/[a-zA-Z0-9]+\/suspended\.html#uri=/,
    /chrome-extension:\/\/[a-zA-Z0-9]+\//,
  ];

  const cleaned = patterns.reduce(
    (acc, pattern) => acc.replace(pattern, ""),
    url
  );
  return cleaned.startsWith("http") ? cleaned : `https://${cleaned}`;
};

const BookmarkEntry: React.FC<BookmarkEntryProps> = ({
  bookmark,
  year,
  showYear,
  remainingCount,
  onToggle,
}) => {
  const cleanedUrl = cleanUrl(bookmark.url);
  return (
    <div className="bookmark-entry">
      {showYear && <span className="year-text">{year}</span>}
      <span className="date-text">{format(bookmark.date, "MMMM d")}</span>
      <span className="domain-text">{extractDomain(cleanedUrl)}</span>
      <span
        className="title-text"
        title={cleanedUrl}
        onClick={() => window.open(cleanedUrl, "_blank")}
      >
        {bookmark.title}
      </span>
      {remainingCount && remainingCount > 0 && (
        <div
          className="counter-circle"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
        >
          <span style={{ fontSize: remainingCount > 99 ? "8px" : "10px" }}>
            {remainingCount > 999 ? "1k+" : remainingCount}
          </span>
        </div>
      )}
    </div>
  );
};

const ControlPanel: React.FC<ControlPanelProps> = ({
  selectedDate,
  setSelectedDate,
  dayRange,
  setDayRange,
  entriesPerYear,
  setEntriesPerYear,
  chronological,
  setChronological,
  searchTerm,
  setSearchTerm,
  searchAll,
  setSearchAll,
}) => (
  <div className="control-panel-content">
    <input
      type="date"
      value={selectedDate.toISOString().split("T")[0]}
      onChange={(e) => setSelectedDate(new Date(e.target.value))}
      className="control-input"
    />
    <div className="control-group">
      <div>
        Range: {dayRange}
        <input
          type="range"
          min="1"
          max="12"
          value={dayRange}
          onChange={(e) => setDayRange(Number(e.target.value))}
          className="range-input"
        />
      </div>
      <div>
        Entries: {entriesPerYear}
        <input
          type="range"
          min="1"
          max="10"
          value={entriesPerYear}
          onChange={(e) => setEntriesPerYear(Number(e.target.value))}
          className="range-input"
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <label style={{ color: "#b8b8b8" }}>
          <input
            type="checkbox"
            checked={searchAll}
            onChange={(e) => setSearchAll(e.target.checked)}
          />
          All
        </label>
      </div>
    </div>
    <button
      onClick={() => setChronological(!chronological)}
      className="control-input"
    >
      {chronological ? "⬆️" : "⬇️"}
    </button>
  </div>
);

export default function App() {
  const [yearGroups, setYearGroups] = useState<YearData[]>([]);
  const [allBookmarks, setAllBookmarks] = useState<BookmarkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [chronological, setChronological] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dayRange, setDayRange] = useState(2);
  const [entriesPerYear, setEntriesPerYear] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchAll, setSearchAll] = useState(false);

  const fetchBookmarks = (baseDate: Date, range: number) => {
    chrome.bookmarks.getTree((nodes) => {
      const processNode = (
        node: chrome.bookmarks.BookmarkTreeNode
      ): BookmarkData[] => {
        const result: BookmarkData[] = [];
        if (node.url && node.dateAdded) {
          const date = new Date(node.dateAdded);
          const bookmark = {
            url: cleanUrl(node.url),
            title: node.title,
            date,
          };
          result.push(bookmark);

          if (isValidBookmark(date, baseDate, range)) {
            return [bookmark];
          }
        }
        return node.children
          ? [...result, ...node.children.flatMap(processNode)]
          : result;
      };

      const processed = nodes.flatMap(processNode);
      setAllBookmarks(processed);

      const filtered = processed.filter((b) =>
        isValidBookmark(b.date, baseDate, range)
      );
      const yearGroups = processBookmarks(filtered);
      setYearGroups(yearGroups);
      setLoading(false);
    });
  };

  const filterBookmarks = (bookmarks: BookmarkData[]): BookmarkData[] => {
    if (!searchTerm) return bookmarks;
    const terms = searchTerm.toLowerCase().split(" ");
    return bookmarks.filter((b) =>
      terms.every(
        (term) =>
          b.title.toLowerCase().includes(term) ||
          cleanUrl(b.url).toLowerCase().includes(term)
      )
    );
  };

  const isValidBookmark = (
    date: Date,
    baseDate: Date,
    range: number
  ): boolean => {
    const currentYear = new Date().getFullYear();
    return (
      date.getFullYear() < currentYear &&
      date.getMonth() === baseDate.getMonth() &&
      Math.abs(baseDate.getDate() - date.getDate()) <= range
    );
  };

  const processBookmarks = (bookmarks: BookmarkData[]): YearData[] => {
    const byYear = _.groupBy(bookmarks, (b) => b.date.getFullYear());
    return Object.entries(byYear)
      .filter(([_, bookmarks]) => bookmarks.length >= 2)
      .map(([year, bookmarks]) => ({
        year: parseInt(year),
        bookmarks: bookmarks.sort(
          (a, b) => b.date.getTime() - a.date.getTime()
        ),
      }));
  };

  useEffect(() => {
    fetchBookmarks(selectedDate, dayRange);
  }, [selectedDate, dayRange]);

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });
  };

  if (error) return <div>Error: {error}</div>;
  if (loading) return <div>Loading...</div>;

  let displayedGroups: YearData[];
  if (searchAll) {
    const filtered = filterBookmarks(allBookmarks);
    displayedGroups = processBookmarks(filtered);
  } else {
    displayedGroups = yearGroups
      .map((year) => ({
        ...year,
        bookmarks: filterBookmarks(year.bookmarks),
      }))
      .filter((year) => year.bookmarks.length > 0);
  }

  const sortedYears = displayedGroups.sort((a, b) =>
    chronological ? a.year - b.year : b.year - a.year
  );

  return (
    <div className="container">
      <div className="control-bar">
        {showControls && (
          <div className="control-panel">
            <ControlPanel
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              dayRange={dayRange}
              setDayRange={setDayRange}
              entriesPerYear={entriesPerYear}
              setEntriesPerYear={setEntriesPerYear}
              chronological={chronological}
              setChronological={setChronological}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              searchAll={searchAll}
              setSearchAll={setSearchAll}
            />
          </div>
        )}
        <button
          onClick={() => setShowControls(!showControls)}
          className={`control-input gear-button ${showControls ? "ml-2" : ""}`}
        >
          ⚙️
        </button>
      </div>

      <div className="bookmark-list">
        {sortedYears.map(({ year, bookmarks }) => (
          <div key={year}>
            {entriesPerYear === 1 ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                {bookmarks
                  .slice(0, expandedYears.has(year) ? undefined : 1)
                  .map((bookmark, i) => (
                    <BookmarkEntry
                      key={i}
                      bookmark={bookmark}
                      year={year}
                      showYear={true}
                      remainingCount={
                        bookmarks.length > 1 ? bookmarks.length - 1 : 0
                      }
                      onToggle={() => toggleYear(year)}
                    />
                  ))}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span className="year-text" style={{ fontSize: "20px" }}>
                    {year}
                  </span>
                  {bookmarks.length > entriesPerYear && (
                    <div
                      className="counter-circle"
                      onClick={() => toggleYear(year)}
                    >
                      <span
                        style={{
                          fontSize:
                            bookmarks.length - entriesPerYear > 99
                              ? "8px"
                              : "10px",
                        }}
                      >
                        {bookmarks.length - entriesPerYear > 999
                          ? "1k+"
                          : bookmarks.length - entriesPerYear}
                      </span>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  {bookmarks
                    .slice(
                      0,
                      expandedYears.has(year) ? undefined : entriesPerYear
                    )
                    .map((bookmark, i) => (
                      <BookmarkEntry key={i} bookmark={bookmark} />
                    ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
