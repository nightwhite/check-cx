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
}

export function DataTable<T>({
  columns,
  records,
  emptyTitle,
  emptyActionLabel,
  getRowKey,
  onCreate,
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

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={getRowKey(record)}>
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
