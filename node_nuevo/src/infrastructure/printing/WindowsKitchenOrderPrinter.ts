import { spawn } from 'node:child_process';
import type {
    IKitchenOrderPrinter,
    KitchenPrintOrder
} from '../../domain/services/IKitchenOrderPrinter.js';

const PAPER_COLUMNS = 48;
const LARGE_TEXT_COLUMNS = 24;
const ESC = 0x1b;
const GS = 0x1d;

export function formatKitchenOrder(order: KitchenPrintOrder): Buffer {
    if (!order.tableName.trim()) {
        throw new Error('El nombre de la mesa es obligatorio para imprimir.');
    }
    if (order.items.length === 0) {
        throw new Error('No hay productos para imprimir.');
    }
    if (!Number.isFinite(order.deliveryFee) || order.deliveryFee < 0) {
        throw new Error('La tarifa de domicilio no es válida.');
    }

    const bytes: number[] = [];
    const write = (text: string): void => {
        bytes.push(...encodeCp850(text));
    };
    const command = (...values: number[]): void => {
        bytes.push(...values);
    };
    const line = (text = ''): void => {
        write(text);
        command(0x0a);
    };
    const wrapped = (text: string, columns = PAPER_COLUMNS): void => {
        for (const row of wrap(text, columns)) line(row);
    };
    const centered = (text: string): void => {
        command(ESC, 0x61, 0x01);
        wrapped(text);
        command(ESC, 0x61, 0x00);
    };
    const bold = (enabled: boolean): void => command(ESC, 0x45, enabled ? 0x01 : 0x00);
    const size = (enabled: boolean): void => command(GS, 0x21, enabled ? 0x11 : 0x00);
    const separator = (): void => line('-'.repeat(PAPER_COLUMNS));

    command(ESC, 0x40);
    command(ESC, 0x74, 0x02);
    if (order.deliveryFee > 0) line('='.repeat(PAPER_COLUMNS));

    centered('COMANDA');
    line();
    size(true);
    bold(true);
    wrapped(`Mesa: ${order.tableName}`, LARGE_TEXT_COLUMNS);
    wrapped(`Hora: ${formatDate(order.createdAt)}`, LARGE_TEXT_COLUMNS);
    bold(false);
    size(false);

    if (order.customerName || order.customerPhone || order.deliveryAddress) {
        command(GS, 0x21, 0x01);
        if (order.deliveryFee > 0) command(GS, 0x42, 0x01);
        wrapped('DOMICILIO DETALLES:', PAPER_COLUMNS);
        if (order.customerName) wrapped(`Cliente: ${order.customerName}`);
        if (order.customerPhone) wrapped(`Tel: ${order.customerPhone}`);
        if (order.deliveryAddress) wrapped(`Dirección: ${order.deliveryAddress}`);
        if (order.deliveryFee > 0) command(GS, 0x42, 0x00);
        command(GS, 0x21, 0x00);
    }

    separator();
    let productsTotal = 0;
    for (const item of order.items) {
        if (
            !item.productName.trim() ||
            !Number.isFinite(item.quantity) ||
            item.quantity <= 0 ||
            !Number.isFinite(item.unitPrice) ||
            item.unitPrice < 0
        ) {
            throw new Error('La comanda contiene un producto o precio inválido.');
        }

        const subtotal = item.quantity * item.unitPrice;
        productsTotal += subtotal;
        size(true);
        bold(true);
        wrapped(`x${formatQuantity(item.quantity)} ${item.productName.trim()}`, LARGE_TEXT_COLUMNS);
        bold(false);
        size(false);
        line(`   ${formatCurrency(subtotal)}`);

        if (item.takeaway) {
            size(true);
            bold(true);
            wrapped(`>> ${'PARA LLEVAR'} <<`, LARGE_TEXT_COLUMNS);
            bold(false);
            size(false);
        }
        if (item.notes?.trim()) {
            size(true);
            bold(true);
            wrapped(`NOTA: ${item.notes.trim()}`, LARGE_TEXT_COLUMNS);
            bold(false);
            size(false);
        }
        line(' - '.repeat(16));
    }

    separator();
    size(true);
    bold(true);
    line(`TOTAL: ${formatCurrency(productsTotal)}`);
    if (order.deliveryFee > 0) {
        line(`DOMI:  ${formatCurrency(order.deliveryFee)}`);
        bold(false);
        size(false);
        line('---------');
        size(true);
        bold(true);
        line(`T.DOM: ${formatCurrency(productsTotal + order.deliveryFee)}`);
    }
    bold(false);
    size(false);

    if (order.deliveryFee > 0) line('='.repeat(PAPER_COLUMNS));
    line();
    line();
    command(GS, 0x56, 0x00);

    return Buffer.from(bytes);
}

export class WindowsKitchenOrderPrinter implements IKitchenOrderPrinter {
    async print(order: KitchenPrintOrder): Promise<void> {
        if (process.platform !== 'win32') {
            throw new Error('La impresión RAW de comandas requiere Windows.');
        }

        const rawPrintScript = [
            "$ErrorActionPreference = 'Stop'",
            '$printerName = $env:ADRIPOS_PRINTER_NAME',
            'if ([string]::IsNullOrWhiteSpace($printerName)) {',
            '  $defaultPrinter = Get-CimInstance Win32_Printer | Where-Object { $_.Default } | Select-Object -First 1',
            '  if ($null -eq $defaultPrinter) { throw "Windows no tiene una impresora predeterminada." }',
            '  $printerName = $defaultPrinter.Name',
            '}',
            '$memory = New-Object System.IO.MemoryStream',
            '[Console]::OpenStandardInput().CopyTo($memory)',
            '$data = $memory.ToArray()',
            'if ($data.Length -eq 0) { throw "No se recibieron datos ESC/POS para imprimir." }',
            '$source = @"',
            'using System;',
            'using System.ComponentModel;',
            'using System.Runtime.InteropServices;',
            'public static class RawPrinter {',
            '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
            '  public class DOC_INFO_1 { public string pDocName; public string pOutputFile; public string pDatatype; }',
            '  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]',
            '  public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);',
            '  [DllImport("winspool.drv", SetLastError = true)]',
            '  public static extern bool ClosePrinter(IntPtr handle);',
            '  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]',
            '  public static extern int StartDocPrinter(IntPtr handle, int level, [In] DOC_INFO_1 info);',
            '  [DllImport("winspool.drv", SetLastError = true)]',
            '  public static extern bool EndDocPrinter(IntPtr handle);',
            '  [DllImport("winspool.drv", SetLastError = true)]',
            '  public static extern bool StartPagePrinter(IntPtr handle);',
            '  [DllImport("winspool.drv", SetLastError = true)]',
            '  public static extern bool EndPagePrinter(IntPtr handle);',
            '  [DllImport("winspool.drv", SetLastError = true)]',
            '  public static extern bool WritePrinter(IntPtr handle, IntPtr bytes, int count, out int written);',
            '  public static void Print(string name, byte[] data) {',
            '    IntPtr printer;',
            '    if (!OpenPrinter(name, out printer, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());',
            '    try {',
            '      var info = new DOC_INFO_1 { pDocName = "AdriPOS - Comanda", pDatatype = "RAW" };',
            '      if (StartDocPrinter(printer, 1, info) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());',
            '      try {',
            '        if (!StartPagePrinter(printer)) throw new Win32Exception(Marshal.GetLastWin32Error());',
            '        var pinned = GCHandle.Alloc(data, GCHandleType.Pinned);',
            '        try {',
            '          int written;',
            '          if (!WritePrinter(printer, pinned.AddrOfPinnedObject(), data.Length, out written)) throw new Win32Exception(Marshal.GetLastWin32Error());',
            '          if (written != data.Length) throw new Exception("Windows no escribió todos los datos en la impresora.");',
            '        } finally { pinned.Free(); }',
            '        if (!EndPagePrinter(printer)) throw new Win32Exception(Marshal.GetLastWin32Error());',
            '      } finally { EndDocPrinter(printer); }',
            '    } finally { ClosePrinter(printer); }',
            '  }',
            '}',
            '"@',
            'Add-Type -TypeDefinition $source',
            '[RawPrinter]::Print($printerName, $data)'
        ].join('\n');

        await new Promise<void>((resolve, reject) => {
            const printerProcess = spawn(
                'powershell.exe',
                ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(rawPrintScript)],
                {
                    env: process.env,
                    windowsHide: true,
                    stdio: ['pipe', 'ignore', 'pipe']
                }
            );
            let errorOutput = '';

            printerProcess.stderr.setEncoding('utf8');
            printerProcess.stderr.on('data', (chunk: string) => {
                errorOutput += chunk;
            });
            printerProcess.once('error', reject);
            printerProcess.once('close', (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }
                reject(new Error(
                    errorOutput.trim() || `La cola RAW de Windows terminó con código ${code ?? 'desconocido'}.`
                ));
            });
            printerProcess.stdin.once('error', reject);
            printerProcess.stdin.end(formatKitchenOrder(order));
        });
    }
}

function encodePowerShell(script: string): string {
    return Buffer.from(script, 'utf16le').toString('base64');
}

function encodeCp850(text: string): number[] {
    const cp850: Record<string, number> = {
        'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
        'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
        'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9
    };

    return Array.from(text, (character) => {
        const mapped = cp850[character];
        if (mapped !== undefined) return mapped;
        const code = character.codePointAt(0) ?? 0x3f;
        return code <= 0x7f ? code : 0x3f;
    });
}

function wrap(value: string, columns: number): string[] {
    const words = value.trim().split(/\s+/);
    const lines: string[] = [];
    let line = '';

    for (const word of words) {
        if (word.length > columns) {
            if (line) lines.push(line);
            line = '';
            for (let offset = 0; offset < word.length; offset += columns) {
                lines.push(word.slice(offset, offset + columns));
            }
            continue;
        }

        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length <= columns) {
            line = candidate;
        } else {
            if (line) lines.push(line);
            line = word;
        }
    }

    if (line) lines.push(line);
    return lines;
}

function formatQuantity(quantity: number): string {
    return String(quantity);
}

function formatCurrency(amount: number): string {
    return `$${Math.round(amount).toLocaleString('es-CO')}`;
}

function formatDate(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        throw new Error('La fecha de la comanda no es válida.');
    }

    const pad = (part: number): string => String(part).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())} (${pad(date.getDate())}/${pad(date.getMonth() + 1)})`;
}
