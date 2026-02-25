import {
  Button,
  Indicator,
  Loader,
  Progress,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip
} from "@mantine/core";
import { useElementSize, useMergedRef } from "@mantine/hooks";
import {
  createColumnHelper,
  FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  Row,
  useReactTable
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MagnifyingGlass, User, Warning } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useGetServersQuery } from "../../state/api";
import { BookDetail } from "../../state/messages";
import {
  DownloadStatus,
  retryDownload,
  sendDownload
} from "../../state/stateSlice";
import { RootState, useAppDispatch } from "../../state/store";
import FacetFilter, {
  ServerFacetEntry,
  StandardFacetEntry
} from "./Filters/FacetFilter";
import { TextFilter } from "./Filters/TextFilter";
import { useTableStyles } from "./styles";

const columnHelper = createColumnHelper<BookDetail>();

const stringInArray: FilterFn<any> = (
  row,
  columnId: string,
  filterValue: string[] | undefined
) => {
  if (!filterValue || filterValue.length === 0) return true;

  return filterValue.includes(row.getValue<string>(columnId));
};

interface BookTableProps {
  books: BookDetail[];
}

export default function BookTable({ books }: BookTableProps) {
  const { classes, cx, theme } = useTableStyles();
  const { data: servers } = useGetServersQuery(null);

  const { ref: elementSizeRef, height, width } = useElementSize();
  const virtualizerRef = useRef<HTMLDivElement | null>(null);
  const mergedRef = useMergedRef<HTMLDivElement>(elementSizeRef, virtualizerRef);

  // Sort books: online servers first, offline last
  const sortedBooks = useMemo(() => {
    if (!servers) return books;

    return [...books].sort((a, b) => {
      const aOnline = servers.includes(a.server);
      const bOnline = servers.includes(b.server);

      // Online servers come first
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;

      // Within same category, sort by server name
      return a.server.localeCompare(b.server);
    });
  }, [books, servers]);

  const columns = useMemo(() => {
    const cols = (cols: number) => (width / 12) * cols;
    return [
      columnHelper.accessor("server", {
        header: (props) => (
          <FacetFilter
            placeholder="Server"
            column={props.column}
            table={props.table}
            Entry={ServerFacetEntry}
          />
        ),
        cell: (props) => {
          const online = servers?.includes(props.getValue());
          return (
            <Text
              size={12}
              weight="normal"
              color="dark"
              style={{ marginLeft: 20 }}>
              <Tooltip
                position="top-start"
                label={online ? "Online" : "Offline"}>
                <Indicator
                  zIndex={0}
                  position="middle-start"
                  offset={-16}
                  size={6}
                  color={online ? "green.6" : "gray"}>
                  {props.getValue()}
                </Indicator>
              </Tooltip>
            </Text>
          );
        },
        size: cols(1),
        enableColumnFilter: true,
        filterFn: stringInArray
      }),
      columnHelper.accessor("author", {
        header: (props) => (
          <TextFilter
            icon={<User weight="bold" />}
            placeholder="Author"
            column={props.column}
            table={props.table}
          />
        ),
        size: cols(2),
        enableColumnFilter: false
      }),
      columnHelper.accessor("title", {
        header: (props) => (
          <TextFilter
            icon={<MagnifyingGlass weight="bold" />}
            placeholder="Title"
            column={props.column}
            table={props.table}
          />
        ),
        minSize: 20,
        size: cols(6),
        enableColumnFilter: false
      }),
      columnHelper.accessor("format", {
        header: (props) => (
          <FacetFilter
            placeholder="Format"
            column={props.column}
            table={props.table}
            Entry={StandardFacetEntry}
          />
        ),
        size: cols(1),
        enableColumnFilter: false,
        filterFn: stringInArray
      }),
      columnHelper.accessor("size", {
        header: "Size",
        size: cols(1),
        enableColumnFilter: false
      }),
      columnHelper.display({
        header: "Download",
        size: cols(1),
        enableColumnFilter: false,
        cell: ({ row }) => {
          const online = servers?.includes(row.original.server) ?? false;
          return (
            <DownloadButton
              book={row.original.full}
              serverName={row.original.server}
              serverOnline={online}
            />
          );
        }
      })
    ];
  }, [width, servers]);

  const table = useReactTable({
    data: sortedBooks,
    columns: columns,
    enableFilters: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues()
  });

  const { rows: tableRows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => virtualizerRef.current,
    estimateSize: () => 50,
    overscan: 10
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const paddingTop =
    virtualItems.length > 0 ? virtualItems?.[0]?.start || 0 : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() -
        (virtualItems?.[virtualItems.length - 1]?.end || 0)
      : 0;

  return (
    <ScrollArea
      viewportRef={mergedRef as any}
      className={classes.container}
      type="hover"
      scrollbarSize={6}
      styles={{ thumb: { ["&::before"]: { minWidth: 4 } } }}
      offsetScrollbars={false}>
      <Table highlightOnHover verticalSpacing="sm" fontSize="xs">
        <thead className={classes.head}>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={classes.headerCell}
                  style={{
                    width: header.getSize()
                  }}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className={cx(classes.resizer, {
                      ["isResizing"]: header.column.getIsResizing()
                    })}
                  />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td style={{ height: `${paddingTop}px` }} />
            </tr>
          )}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = tableRows[
              virtualRow.index
            ] as unknown as Row<BookDetail>;
            return (
              <tr key={row.id} style={{ height: 50 }}>
                {row.getVisibleCells().map((cell) => {
                  return (
                    <td key={cell.id}>
                      <Text lineClamp={1} color="dark">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </Text>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr>
              <td style={{ height: `${paddingBottom}px` }} />
            </tr>
          )}
        </tbody>
      </Table>
    </ScrollArea>
  );
}

function DownloadButton({
  book,
  serverName,
  serverOnline
}: {
  book: string;
  serverName: string;
  serverOnline: boolean;
}) {
  const dispatch = useAppDispatch();

  const download = useSelector(
    (state: RootState) => state.state.downloads[book]
  );
  const isInFlight = useSelector((state: RootState) =>
    state.state.inFlightDownloads.includes(book)
  );

  const [timeElapsed, setTimeElapsed] = useState(0);

  // Track elapsed time for status messages
  useEffect(() => {
    if (!download || download.status !== DownloadStatus.PENDING) {
      setTimeElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - download.timestamp) / 1000);
      setTimeElapsed(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [download]);

  const getStatusMessage = () => {
    if (!download) return "Download";

    switch (download.status) {
      case DownloadStatus.PENDING:
        if (download.progress > 0) return `${Math.round(download.progress)}%`;
        if (timeElapsed < 5) return `Requesting...`;
        if (timeElapsed < 30) return `Waiting...`;
        return `Still waiting...`;
      case DownloadStatus.DOWNLOADING:
        return "Downloading...";
      case DownloadStatus.SUCCESS:
        return "✓ Done";
      case DownloadStatus.TIMEOUT:
        return "Retry";
      case DownloadStatus.FAILED:
        return "Retry";
      default:
        return "Download";
    }
  };

  const onClick = () => {
    if (download?.status === DownloadStatus.PENDING || isInFlight) return;

    if (
      download?.status === DownloadStatus.TIMEOUT ||
      download?.status === DownloadStatus.FAILED
    ) {
      dispatch(retryDownload({ book, serverName }));
    } else {
      dispatch(sendDownload({ book, serverName }));
    }
  };

  const isDisabled =
    download?.status === DownloadStatus.PENDING ||
    download?.status === DownloadStatus.DOWNLOADING ||
    isInFlight;

  const getButtonColor = () => {
    if (download?.status === DownloadStatus.SUCCESS) return "green";
    if (
      download?.status === DownloadStatus.TIMEOUT ||
      download?.status === DownloadStatus.FAILED
    )
      return "orange";
    if (!serverOnline) return "gray";
    return "blue";
  };

  return (
    <Stack spacing={4}>
      <Tooltip
        label={
          !serverOnline
            ? "Server may be offline - download might not work"
            : download?.status === DownloadStatus.TIMEOUT
            ? "Server did not respond - click to retry"
            : ""
        }
        disabled={serverOnline && !download}
        position="left">
        <Button
          compact
          size="xs"
          radius="sm"
          onClick={onClick}
          disabled={isDisabled}
          color={getButtonColor()}
          variant={!serverOnline ? "subtle" : "filled"}
          sx={{ fontWeight: "normal", width: 95, fontSize: "11px", touchAction: "manipulation" }}
          aria-label={
            !serverOnline
              ? `Download from ${serverName} (may be offline)`
              : download?.status === DownloadStatus.TIMEOUT
              ? `Retry download from ${serverName}`
              : `Download from ${serverName}`
          }
          aria-busy={isDisabled}
          leftIcon={
            !serverOnline ? (
              <Warning size={12} weight="fill" aria-hidden="true" />
            ) : isDisabled ? (
              <Loader size="xs" variant="dots" aria-hidden="true" />
            ) : null
          }>
          {getStatusMessage()}
        </Button>
      </Tooltip>

      {download && download.status === DownloadStatus.PENDING && download.progress > 0 && (
        <Progress value={download.progress} size={4} radius="xl" color="blue" />
      )}
    </Stack>
  );
}
