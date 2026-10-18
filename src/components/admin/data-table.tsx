import * as React from "react";

import { Button } from "../../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";

interface DataTableColumn<T> {
  key: string;
  header: string;
  cell(record: T): React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  records: T[];
  emptyTitle: string;
  emptyActionLabel: string;
  getRowKey(record: T): string;
  onCreate(): void;
  /** 传入后在首列显示勾选框，用于批量操作 */
  selection?: {
    selected: Set<string>;
    onChange(next: Set<string>): void;
    getLabel(record: T): string;
  };
}

export function DataTable<T>({
  columns,
  records,
  emptyTitle,
  emptyActionLabel,
  getRowKey,
  onCreate,
  selection,
}: DataTableProps<T>) {
  if (records.length === 0) {
    return (
      <div className="grid min-h-56 place-items-center rounded-lg border bg-card px-4 py-8 text-center">
        <div className="grid gap-3">
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <Button type="button" onClick={onCreate}>
            {emptyActionLabel}
          </Button>
        </div>
      </div>
    );
  }

  const visibleKeys = records.map(getRowKey);
  const selectedVisible = selection
    ? visibleKeys.filter((key) => selection.selected.has(key)).length
    : 0;
  const allSelected = selectedVisible > 0 && selectedVisible === visibleKeys.length;

  function toggleAll() {
    if (!selection) {
      return;
    }
    const next = new Set(selection.selected);
    for (const key of visibleKeys) {
      if (allSelected) {
        next.delete(key);
      } else {
        next.add(key);
      }
    }
    selection.onChange(next);
  }

  function toggleRow(key: string) {
    if (!selection) {
      return;
    }
    const next = new Set(selection.selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    selection.onChange(next);
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {selection ? (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="全选当前列表"
                  checked={allSelected}
                  ref={(element) => {
                    if (element) {
                      element.indeterminate = selectedVisible > 0 && !allSelected;
                    }
                  }}
                  onChange={toggleAll}
                />
              </TableHead>
            ) : null}
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow
              key={getRowKey(record)}
              data-state={selection?.selected.has(getRowKey(record)) ? "selected" : undefined}
            >
              {selection ? (
                <TableCell className="w-10">
                  <input
                    type="checkbox"
                    aria-label={`选择 ${selection.getLabel(record)}`}
                    checked={selection.selected.has(getRowKey(record))}
                    onChange={() => toggleRow(getRowKey(record))}
                  />
                </TableCell>
              ) : null}
              {columns.map((column) => (
                <TableCell key={column.key} className={column.className}>
                  {column.cell(record)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
