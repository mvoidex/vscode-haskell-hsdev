'use strict';

import {
    Files
} from 'vscode-languageserver';


/**
 * Tools for URI manipulations
 */
export class UriUtils {

    public static normalizeFilePath(filePath: string): string {
        return filePath.replace(/\\/g, '/');
    }

    /**
     * Converts an URI to a filePath
     */
    public static toFilePath(uri: string): string {
        let filePath = Files.uriToFilePath(uri);
        //On win32, uriToFilePath returns a lowercase drive letter
        if (process.platform === 'win32') {
            filePath = filePath.charAt(0).toUpperCase() + filePath.substr(1);
        }
        return filePath;
    }

    /**
     * Converts a filePath to an URI
     */
    public static toUri(filePath: string): string {
        let prefix = '';
        //On win32, prefix has to be one '/' more longer
        if (process.platform === 'win32') {
            prefix = 'file:///';
        }
        else {
            prefix = 'file://';
        }
        return prefix + UriUtils.normalizeFilePath(filePath).split('/').map(encodeURIComponent).join('/');
    }

    /**
     * Tests if URI is a file path
     */
    public static isFileProtocol(uri: string): boolean {
        return UriUtils.toFilePath(uri) !== null;
    }
}