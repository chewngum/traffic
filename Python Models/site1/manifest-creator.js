const fs = require('fs');
const path = require('path');
const readline = require('readline');

class SiteManifestGenerator {
    constructor(options = {}) {
        this.options = {
            // File extensions to include as pages
            pageExtensions: ['.html', '.htm', '.php', '.asp', '.aspx', '.jsp'],
            // Access level mappings based on folder names
            folderAccessMappings: {
                'admin': 3,
                'dashboard': 2,
                'private': 3,
                'premium': 2,
                'members': 2,
                'user': 2,
                'staff': 2,
                'public': 1,
                'free': 1,
                'guest': 1,
                'restricted': 3,
                'secure': 3
            },
            // Page type mappings based on folder structure
            pageTypeMappings: {
                'dashboard': 'dashboard',
                'admin': 'admin',
                'tools': 'tool',
                'simulators': 'simulator',
                'support': 'support',
                'account': 'account',
                'auth': 'auth',
                'landing': 'landing'
            },
            // Files to exclude
            excludeFiles: ['.DS_Store', 'Thumbs.db', '.gitkeep', 'README.md'],
            // Folders to exclude
            excludeFolders: ['.git', 'node_modules', '.vscode', '.idea', 'assets', 'css', 'js', 'images', 'fonts'],
            // Default access level
            defaultAccessLevel: 1,
            // Output file path
            outputFile: 'site-manifest.json',
            // Site configuration
            siteConfig: {
                siteName: 'Engineering Simulations',
                adminEmail: 'admin@example.com',
                tokenExpiry: 24,
                version: '1.0.0'
            },
            ...options
        };
    }

    /**
     * Main method to generate site manifest
     */
    async generateManifest(rootPath, interactive = true) {
        try {
            console.log(`🔍 Scanning website structure: ${rootPath}`);
            
            if (!fs.existsSync(rootPath)) {
                throw new Error(`Root path does not exist: ${rootPath}`);
            }

            const pages = {};
            const categories = new Set();
            
            await this.scanDirectory(rootPath, rootPath, pages, categories);
            
            console.log(`\n📊 Found ${Object.keys(pages).length} pages in ${Array.from(categories).size} categories`);
            
            // Interactive access level assignment
            if (interactive) {
                await this.interactiveAccessLevelAssignment(pages);
            }
            
            const manifest = {
                metadata: {
                    generatedAt: new Date().toISOString(),
                    version: this.options.siteConfig.version,
                    description: `Site configuration manifest for ${this.options.siteConfig.siteName} platform`
                },
                pages: pages,
                navigation: this.generateNavigation(pages, categories),
                users: this.generateDefaultUsers(),
                accessLevels: this.generateAccessLevels(),
                settings: {
                    tokenExpiry: this.options.siteConfig.tokenExpiry,
                    defaultAccessLevel: this.options.defaultAccessLevel,
                    siteName: this.options.siteConfig.siteName,
                    adminEmail: this.options.siteConfig.adminEmail
                }
            };

            await this.writeJsonFile(manifest);
            console.log(`\n✅ Site manifest generated successfully!`);
            console.log(`📄 Output saved to: ${this.options.outputFile}`);
            console.log(`📊 Total pages: ${Object.keys(pages).length}`);
            console.log(`🏷️  Categories: ${Array.from(categories).join(', ')}`);
            
            return manifest;
        } catch (error) {
            console.error('❌ Error generating site manifest:', error.message);
            throw error;
        }
    }

    /**
     * Recursively scan directory structure
     */
    async scanDirectory(currentPath, rootPath, pages, categories, parentCategory = '') {
        const dirContents = fs.readdirSync(currentPath);

        for (const item of dirContents) {
            const itemPath = path.join(currentPath, item);
            const stats = fs.statSync(itemPath);

            if (this.shouldExclude(item, stats.isDirectory())) {
                continue;
            }

            if (stats.isDirectory()) {
                // Process subdirectory
                const category = parentCategory || item;
                categories.add(category);
                await this.scanDirectory(itemPath, rootPath, pages, categories, category);
            } else if (this.isPage(item)) {
                // Process page file
                const relativePath = path.relative(rootPath, itemPath);
                const webPath = this.generateWebPath(relativePath);
                const category = parentCategory || 'landing';
                const pageId = this.generatePageId(webPath, item);
                
                categories.add(category);
                
                pages[webPath] = {
                    path: webPath,
                    name: this.extractDisplayName(itemPath, item),
                    category: category,
                    pageId: pageId,
                    type: this.determinePageType(category, relativePath),
                    accessLevel: this.determineAccessLevel(relativePath, category),
                    hasIndex: this.isIndexPage(item),
                    metadata: {
                        filename: item,
                        extension: path.extname(item),
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime
                    }
                };
            }
        }
    }

    /**
     * Generate web path from file path
     */
    generateWebPath(relativePath) {
        let webPath = relativePath.replace(/\\/g, '/');
        
        // Handle index files
        if (webPath.endsWith('/index.html') || webPath.endsWith('/index.htm')) {
            webPath = webPath.substring(0, webPath.lastIndexOf('/')) + '/';
        } else if (webPath === 'index.html' || webPath === 'index.htm') {
            webPath = '/';
        } else {
            // Remove file extension for clean URLs
            webPath = webPath.replace(/\.(html|htm|php)$/, '/');
        }
        
        // Ensure path starts with /
        if (!webPath.startsWith('/')) {
            webPath = '/' + webPath;
        }
        
        return webPath;
    }

    /**
     * Generate unique page ID
     */
    generatePageId(webPath, filename) {
        if (webPath === '/') return 'landing';
        
        // Remove slashes and create camelCase ID
        let id = webPath.replace(/^\/|\/$/g, '').replace(/\//g, '-');
        
        // Handle special cases
        if (id.endsWith('-')) {
            id = id.slice(0, -1);
        }
        
        // If it's an index page, add suffix
        if (this.isIndexPage(filename) && id !== 'landing') {
            id += '-dashboard';
        }
        
        return id || 'home';
    }

    /**
     * Determine page type based on category and path
     */
    determinePageType(category, relativePath) {
        const lowerCategory = category.toLowerCase();
        
        // Check specific mappings
        if (this.options.pageTypeMappings[lowerCategory]) {
            return this.options.pageTypeMappings[lowerCategory];
        }
        
        // Check if it's a dashboard/index page
        if (relativePath.includes('index.')) {
            return 'dashboard';
        }
        
        // Default to category name or 'page'
        return lowerCategory || 'page';
    }

    /**
     * Determine access level based on path and category
     */
    determineAccessLevel(relativePath, category) {
        const pathParts = relativePath.toLowerCase().split(path.sep);
        const categoryLower = category.toLowerCase();
        
        // Check folder-based access mappings
        for (const part of pathParts) {
            if (this.options.folderAccessMappings[part]) {
                return this.options.folderAccessMappings[part];
            }
        }
        
        // Check category-based mapping
        if (this.options.folderAccessMappings[categoryLower]) {
            return this.options.folderAccessMappings[categoryLower];
        }
        
        return this.options.defaultAccessLevel;
    }

    /**
     * Extract display name from file
     */
    extractDisplayName(filePath, filename) {
        try {
            // Try to extract title from HTML files
            if (path.extname(filePath).toLowerCase() === '.html') {
                const content = fs.readFileSync(filePath, 'utf8');
                const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch && titleMatch[1]) {
                    return titleMatch[1].trim();
                }
                
                // Try h1 tag
                const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
                if (h1Match && h1Match[1]) {
                    return h1Match[1].trim();
                }
            }
        } catch (error) {
            // Ignore extraction errors
        }
        
        // Fallback to formatted filename
        return this.formatDisplayName(filename);
    }

    /**
     * Format filename into display name
     */
    formatDisplayName(filename) {
        const name = path.basename(filename, path.extname(filename));
        
        // Handle special cases
        if (name === 'index') return 'Dashboard';
        
        // Convert kebab-case or snake_case to Title Case
        return name
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Check if file is an index page
     */
    isIndexPage(filename) {
        const baseName = path.basename(filename, path.extname(filename));
        return baseName.toLowerCase() === 'index';
    }

    /**
     * Generate navigation structure
     */
    generateNavigation(pages, categories) {
        const navigation = {};
        const categoryPages = {};
        
        // Group pages by category
        Object.values(pages).forEach(page => {
            if (!categoryPages[page.category]) {
                categoryPages[page.category] = [];
            }
            categoryPages[page.category].push(page);
        });
        
        // Create navigation structure
        Object.keys(categoryPages).forEach(category => {
            const pagesInCategory = categoryPages[category];
            const dashboardPage = pagesInCategory.find(p => p.type === 'dashboard') || pagesInCategory[0];
            
            if (!dashboardPage) return;
            
            const navItem = {
                label: this.formatDisplayName(category),
                path: dashboardPage.path,
                accessLevel: dashboardPage.accessLevel
            };
            
            // Add children if there are multiple pages in category
            const childPages = pagesInCategory.filter(p => p !== dashboardPage);
            if (childPages.length > 0) {
                navItem.children = childPages.map(page => ({
                    label: page.name,
                    path: page.path,
                    pageId: page.pageId,
                    accessLevel: page.accessLevel
                }));
            }
            
            navigation[category] = navItem;
        });
        
        return navigation;
    }

    /**
     * Generate default users
     */
    generateDefaultUsers() {
        return {
            guest: {
                password: 'guest123',
                accessLevel: 1,
                displayName: 'Guest User',
                description: 'Limited access to basic features'
            },
            demo: {
                password: 'demo456',
                accessLevel: 2,
                displayName: 'Demo User',
                description: 'Standard access to most features'
            },
            admin: {
                password: 'admin789',
                accessLevel: 3,
                displayName: 'Administrator',
                description: 'Full access to all features'
            }
        };
    }

    /**
     * Generate access level definitions
     */
    generateAccessLevels() {
        return {
            1: {
                name: 'Guest',
                color: '#6c757d',
                description: 'Basic access to free features and tools'
            },
            2: {
                name: 'Premium',
                color: '#6b99c2',
                description: 'Access to advanced features and premium content'
            },
            3: {
                name: 'Admin',
                color: '#354e8d',
                description: 'Full access to all features and administrative tools'
            },
            4: {
                name: 'Public',
                color: '#28a745',
                description: 'Publicly accessible content'
            }
        };
    }

    /**
     * Utility methods
     */
    shouldExclude(itemName, isDirectory) {
        if (isDirectory) {
            return this.options.excludeFolders.includes(itemName) || itemName.startsWith('.');
        } else {
            return this.options.excludeFiles.includes(itemName) || itemName.startsWith('.');
        }
    }

    isPage(filename) {
        const ext = path.extname(filename).toLowerCase();
        return this.options.pageExtensions.includes(ext);
    }

    async writeJsonFile(data) {
        const jsonString = JSON.stringify(data, null, 2);
        fs.writeFileSync(this.options.outputFile, jsonString, 'utf8');
    }

    /**
     * Generate summary report
     */
    generateSummary(manifest) {
        const pages = Object.values(manifest.pages);
        const summary = {
            totalPages: pages.length,
            pagesByType: {},
            pagesByAccessLevel: {},
            pagesByCategory: {}
        };

        pages.forEach(page => {
            // Count by type
            summary.pagesByType[page.type] = (summary.pagesByType[page.type] || 0) + 1;
            
            // Count by access level
            summary.pagesByAccessLevel[page.accessLevel] = (summary.pagesByAccessLevel[page.accessLevel] || 0) + 1;
            
            // Count by category
            summary.pagesByCategory[page.category] = (summary.pagesByCategory[page.category] || 0) + 1;
        });

        return summary;
    }
}

// Usage example and CLI interface
async function main() {
    const args = process.argv.slice(2);
    const rootPath = args[0] || './website';
    
    const options = {
        outputFile: args[1] || 'site-manifest.json',
        siteConfig: {
            siteName: process.env.SITE_NAME || 'My Website',
            adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
            version: '1.0.0'
        },
        // Customize access mappings as needed
        folderAccessMappings: {
            'admin': 3,
            'dashboard': 2,
            'premium': 2,
            'members': 2,
            'tools': 2,
            'simulators': 2,
            'public': 1,
            'support': 4,
            'help': 4,
            'docs': 4
        }
    };

    try {
        const generator = new SiteManifestGenerator(options);
        const manifest = await generator.generateManifest(rootPath);
        
        // Generate and display summary
        const summary = generator.generateSummary(manifest);
        console.log('\n📈 Summary:');
        console.log(`   Total Pages: ${summary.totalPages}`);
        console.log(`   By Type:`, summary.pagesByType);
        console.log(`   By Access Level:`, summary.pagesByAccessLevel);
        console.log(`   Navigation Items: ${Object.keys(manifest.navigation).length}`);
        
    } catch (error) {
        console.error('Failed to generate site manifest:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = SiteManifestGenerator;

// Run if called directly
if (require.main === module) {
    main();
}