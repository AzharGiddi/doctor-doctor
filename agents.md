# Doctor Website Platform — AGENTS.md

## 1. PROJECT MISSION

We are building a production-ready, reusable, multi-tenant website builder specifically for doctors and clinics.

This is NOT a one-off doctor website.

The platform must allow us to create, manage, deploy, and operate many doctor websites from one reusable architecture and codebase.

The first client/tenant is:

- Madilu Women's Health

Madilu is Tenant #1 and the first implementation/template used to validate the platform.

The core principle is:

> Build the platform first. Madilu is the first tenant, not a separate application.

---

# 2. CORE PRODUCT MODEL

The platform has this conceptual structure:

Platform
├── Tenant A
│   ├── Doctor
│   ├── Website
│   ├── Content
│   ├── Media
│   ├── Theme
│   ├── Services
│   ├── Appointments
│   └── Domain
├── Tenant B
└── Tenant N

All tenants share:

- Application code
- CMS architecture
- Database architecture
- Appointment engine
- Media architecture
- Theme engine
- Page/block system
- Authentication architecture

Tenant-specific data must remain isolated.

Only the following should normally differ between tenants:

- Doctor information
- Clinic information
- Branding
- Theme/look and feel
- Images
- Videos
- Audio
- Services
- Content
- Testimonials
- FAQs
- SEO
- Appointment configuration
- Domain

---

# 3. LOCKED TECHNOLOGY DIRECTION

Use the following technology direction unless there is a strong technical reason to change it.

## Frontend / Application

- Next.js
- TypeScript
- React

## Database

- PostgreSQL

## ORM

- Prisma

## Development database

- Local PostgreSQL
- Prefer Docker for local development

## Media storage

Use a storage abstraction.

Development:
- Local filesystem

Production:
- Object/cloud storage

Do NOT tightly couple application logic to a specific storage provider.

## Source control

- Git
- GitHub

## Deployment

- Git-based deployment
- Environment-specific configuration

---

# 4. INFRASTRUCTURE COST CONSTRAINT

We are intentionally NOT purchasing paid infrastructure during initial development.

Do NOT introduce a paid:

- Database
- Cloud storage
- AWS service
- Azure service
- Google Cloud service
- Supabase paid plan
- CDN
- SMS provider
- WhatsApp provider

unless explicitly requested.

Initial development should work with:

- Developer machine
- Docker
- Local PostgreSQL
- Local filesystem media storage

The application architecture must make later infrastructure migration easy.

---

# 5. ARCHITECTURAL PRINCIPLE

Keep these concerns separate:

1. Content
2. Presentation/design
3. Business logic
4. Infrastructure

Conceptually:

Application
├── CMS/content
├── Theme/design
├── Appointment/business logic
└── Infrastructure adapters

Do not put infrastructure-specific code directly into business logic.

---

# 6. MULTI-TENANCY

Multi-tenancy is mandatory from day one.

Every tenant-owned database entity must be associated with a tenant.

Use:

tenantId

or equivalent.

Examples:

- pages
- media
- services
- testimonials
- FAQs
- articles
- navigation
- appointments
- availability
- settings
- theme

## Critical security rule

NEVER trust a tenantId supplied by the browser.

The authenticated user's permissions/session must determine which tenant they can access.

A tenant user must never be able to query, modify, delete, or view another tenant's data.

Super Admin can access all tenants.

---

# 7. USER ROLES

The platform must support role-based access.

## SUPER_ADMIN

Full platform access.

Can:

- Create tenants
- Manage tenants
- Manage doctors
- Manage websites
- Manage templates
- Manage themes
- Manage users
- Manage content
- Manage media
- Manage appointments
- Configure domains
- View platform information
- Manage system settings

## DOCTOR

Can manage their own tenant's:

- Profile
- Website
- Content
- Services
- Media
- Appointments
- Availability
- Settings

## RECEPTIONIST

Primarily manages:

- Appointments
- Availability
- Booking information

## CONTENT_MANAGER

Can manage:

- Pages
- Articles
- FAQs
- Testimonials
- Media
- Videos
- Audio

Access must remain tenant-scoped.

---

# 8. CMS REQUIREMENT

The CMS must give clients complete control over their website content without requiring a developer for normal changes.

CMS must eventually manage:

- Homepage
- About page
- Doctor profile
- Services
- Service details
- Testimonials
- FAQs
- Articles
- Videos
- Podcasts/audio
- Resources
- Contact information
- Clinic information
- Navigation
- Footer
- CTA labels
- Social links
- SEO
- Site settings

---

# 9. PAGE BUILDER

Pages should be built from reusable blocks/components.

Do NOT hard-code individual doctor homepages.

Initial block types:

- Hero
- Text
- Image
- Image + Text
- Doctor Profile
- Services
- Service Cards
- Trust Statistics
- Testimonials
- FAQ
- Video
- Audio/Podcast
- Articles
- Gallery
- CTA
- Contact
- Map
- Booking CTA
- Footer

Blocks must eventually support:

- Add
- Edit
- Delete
- Duplicate
- Reorder
- Hide/show

Page structure should be stored as structured data, not arbitrary HTML where possible.

---

# 10. CONTENT WORKFLOW

Content lifecycle:

Draft
→ Preview
→ Publish

Support:

- DRAFT
- PUBLISHED
- ARCHIVED

Architecture should allow future:

- Revision history
- Restore previous version
- Scheduled publishing

---

# 11. MEDIA LIBRARY

Media is a first-class CMS feature.

Support:

## Images

- JPG
- PNG
- WebP
- SVG where safe

## Video

- MP4
- Other appropriate formats

## Audio

- MP3
- Other appropriate formats

## Documents

- PDF
- Other useful document formats

Media metadata should include where appropriate:

- filename
- type
- MIME type
- size
- width
- height
- storage key
- alt text
- caption
- description
- transcript
- thumbnail
- duration
- tenant
- timestamps

Media must always be tenant-isolated.

---

# 12. STORAGE ABSTRACTION

Do NOT write CMS code that directly depends on local filesystem paths or a cloud vendor.

Create a storage interface/provider abstraction.

Example conceptual interface:

StorageProvider

Operations:

- put
- delete
- url

Development implementation:

LocalStorageProvider

Future implementations:

- ObjectStorageProvider
- S3-compatible provider
- Cloudflare R2
- Host-specific storage

The CMS/business logic must not care which implementation is active.

---

# 13. THEME SYSTEM

Content and design must be separate.

Themes should control presentation without changing the content model.

Themes should use design tokens.

Example tokens:

- primary
- secondary
- accent
- background
- surface
- text
- muted text
- heading font
- body font
- button style
- card style
- border radius
- shadows
- spacing
- content width
- header style
- footer style
- hero style
- animation style

---

# 14. WEBSITE TEMPLATES

The same architecture must support multiple visual templates.

Initial conceptual templates:

## Women's Health

Elegant, premium, editorial, warm, sophisticated.

## Cardiology

Clinical, premium, trustworthy, executive.

## Dermatology

Minimal, luxury, editorial.

## Paediatrics

Friendly, modern, approachable.

## Dental

Premium, clean, modern, clinical.

These must be themes/templates, NOT separate codebases.

---

# 15. APPOINTMENT ENGINE

Appointments are a core reusable platform feature.

Configuration must support:

- Doctor
- Service
- Consultation type
- Date
- Duration
- Working hours
- Breaks
- Holidays
- Doctor leave
- Booking buffer
- Cancellation policy

Consultation types:

- IN_PERSON
- VIDEO
- PHONE

Appointment statuses:

- PENDING
- CONFIRMED
- CANCELLED
- COMPLETED
- NO_SHOW

Future status:

- RESCHEDULED

---

# 16. SLOT GENERATION

Available appointment slots must be calculated from:

Working hours
+ service duration
+ breaks
+ existing appointments
+ holidays
+ leave
+ booking buffer

The system MUST prevent double booking.

Do not rely only on frontend validation.

Server/database-level protection must also be considered.

---

# 17. NOTIFICATIONS

Architecture should support provider abstraction for:

- Email
- WhatsApp
- SMS

Expected lifecycle:

Booking
→ Confirmation
→ Reminder
→ Appointment
→ Follow-up

Do not purchase providers during initial development.

Implement interfaces/adapters so providers can be added later.

---

# 18. CLIENT ONBOARDING

Eventually a new doctor should be created through a guided workflow:

Create Doctor
→ Create Tenant
→ Select Template
→ Configure Branding
→ Upload Logo
→ Upload Doctor Images
→ Add Services
→ Add Content
→ Configure Appointment Schedule
→ Configure SEO
→ Preview
→ Connect Domain
→ Publish

This should become a proper onboarding wizard.

---

# 19. DOMAIN ARCHITECTURE

Each tenant should eventually support its own domain.

Examples:

- drsunitha.com
- drabc.com
- drxyz.com

Domain resolution concept:

Incoming domain
→ Tenant Resolver
→ tenant
→ Website renderer

Do not create a separate application per domain.

---

# 20. SEO

SEO must be tenant-aware and CMS-controlled.

Per page:

- SEO title
- Meta description
- Slug
- Canonical URL
- Open Graph title
- Open Graph description
- Social image
- Robots configuration

Platform/site level:

- sitemap
- robots.txt
- structured data
- doctor schema
- appropriate medical/clinic schema
- breadcrumbs

Do not invent medical qualifications, awards, statistics, testimonials, or clinical claims.

Use verified client-provided information.

---

# 21. PUBLIC WEBSITE

Each tenant website should eventually support:

- Home
- About Doctor
- Services
- Individual Service
- Resources
- Articles
- Videos
- Podcasts
- FAQs
- Contact
- Book Appointment

Future possibilities:

- Locations
- Gallery
- Patient information
- Insurance
- Policies
- Privacy
- Terms

---

# 22. SITE SETTINGS

Tenant settings should eventually include:

## Branding

- Logo
- Favicon
- Colors
- Fonts

## Contact

- Phone
- Email
- Address
- Working hours
- Social links

## Conversion

- Appointment CTA
- Phone CTA
- WhatsApp CTA
- Contact CTA

## Footer

- Copyright
- Links
- Social links
- Legal links

---

# 23. ANALYTICS

Architecture should support tenant-specific:

- Google Analytics
- Google Search Console
- Conversion tracking
- Appointment conversion
- Phone clicks
- WhatsApp clicks
- Contact clicks

Do not add paid analytics infrastructure during initial development.

---

# 24. SECURITY

Production requirements:

- Secure authentication
- Password hashing
- Role-based authorization
- Tenant isolation
- Secure sessions
- HTTPS
- Secure cookies
- Input validation
- File upload validation
- MIME/type validation
- File size limits
- Rate limiting
- CSRF protection where applicable
- API authorization
- Audit logging
- Secure environment variables
- Database backups
- Media backups

Never expose secrets in source code.

Never commit `.env`.

---

# 25. DATABASE

Current primary entities:

- Tenant
- User
- Doctor
- SiteSettings
- Theme
- Page
- Media
- Service
- Testimonial
- FAQ
- Article
- NavigationItem
- Availability
- Appointment

Potential future entities:

- PageRevision
- MediaFolder
- Domain
- Notification
- AuditLog
- Patient
- ClinicLocation
- SocialLink
- SEOSettings
- Template
- ThemePreset
- Subscription

Do not introduce additional entities without a concrete requirement.

---

# 26. CURRENT DEVELOPMENT ENVIRONMENT

The initial development environment must work without paid infrastructure.

Expected:

Developer machine
├── Next.js
├── PostgreSQL
├── Prisma
└── Local media storage

Docker should be used for PostgreSQL.

---

# 27. ENVIRONMENT SEPARATION

Eventually support:

development
→ staging
→ production

Use environment variables.

Never hard-code:

- database URLs
- API keys
- passwords
- tokens
- production domains
- provider secrets

---

# 28. BACKUPS

Production must eventually provide:

- Database backups
- Media backups
- Git repository for code
- Secure configuration backup

A hosting failure must not destroy a client's website/content.

---

# 29. REUSABILITY RULE

Before implementing a feature, ask:

> Can this work for Doctor #2 without copying or rewriting the feature?

If not, redesign the implementation.

BAD:

Madilu-specific component with hard-coded content.

GOOD:

Generic component receiving tenant content/configuration.

BAD:

Hard-coded colors inside components.

GOOD:

Theme tokens.

BAD:

Madilu-specific appointment logic.

GOOD:

Reusable appointment engine.

BAD:

Hard-coded media paths.

GOOD:

Tenant-aware StorageProvider.

---

# 30. PLATFORM ADMIN

Eventually platform admin should include:

Dashboard
├── Tenants
├── Doctors
├── Websites
├── Templates
├── Themes
├── Users
├── Media
├── Appointments
├── Domains
├── Analytics
├── System Settings
└── Audit Logs

Dashboard metrics can include:

- Active tenants
- Published websites
- Draft websites
- Appointments
- Storage usage
- Recent activity
- Domains
- System health

---

# 31. CLIENT DASHBOARD

Each doctor/tenant dashboard should eventually include:

Dashboard
├── Website
│   ├── Pages
│   ├── Navigation
│   └── Theme
├── Doctor Profile
├── Services
├── Media
├── Articles
├── Videos
├── Podcasts
├── FAQs
├── Testimonials
├── Appointments
├── Availability
├── SEO
└── Settings

---

# 32. WHITE-LABEL / BUSINESS MODEL

The architecture should eventually support operating the platform as a service.

Potential future model:

Platform
├── Client 1
├── Client 2
├── Client 3
└── Client N

Possible future commercial features:

- Subscription plans
- Setup fees
- Website packages
- Premium templates
- Appointment add-ons
- Hosting
- Maintenance
- SEO services
- Content services

Billing is NOT part of the current initial implementation.

---

# 33. PRODUCTION INFRASTRUCTURE

Do not lock the application to a hosting provider.

Production concept:

Internet
→ CDN/WAF
→ Public website/CMS/API
→ Application
→ PostgreSQL
→ Object storage

Hostinger is a possible hosting provider, but infrastructure should remain portable.

Do not write Hostinger-specific application logic.

---

# 34. CURRENT IMPLEMENTATION STATUS

A first platform foundation has already been created.

Current foundation includes:

- Next.js
- TypeScript
- PostgreSQL Docker setup
- Prisma
- Multi-tenant schema
- Local storage abstraction
- Madilu tenant seed
- Basic tenant renderer
- Basic admin dashboard
- Initial theme data
- Initial appointment/availability models
- Initial CMS data models

This foundation should be treated as scaffolding, not as finished production software.

---

# 35. IMMEDIATE DEVELOPMENT PRIORITY

Continue development in this order:

## Phase 1 — Authentication & Authorization

Build:

- Login
- Logout
- Sessions
- Password security
- Role-based access
- Tenant authorization
- Super Admin access
- Tenant user access

Do NOT build the visual CMS before authorization is sound.

## Phase 2 — Real CMS

Build:

- Dashboard
- Pages
- Block editor
- Services
- FAQs
- Testimonials
- Articles
- Navigation
- Site settings
- Draft/preview/publish

## Phase 3 — Media Library

Build:

- Upload
- Library
- Search
- Filtering
- Folders
- Metadata
- Images
- Video
- Audio
- Documents
- Tenant isolation

## Phase 4 — Theme Engine

Build:

- Theme presets
- Design tokens
- Color editor
- Typography editor
- Button styles
- Card styles
- Header/footer options
- Preview

## Phase 5 — Appointment Engine

Build:

- Availability
- Slot generation
- Booking
- Double-booking protection
- Appointment management
- Cancellation
- Consultation types

## Phase 6 — Client Onboarding

Build:

- Create tenant
- Create doctor
- Select template
- Branding
- Content setup
- Services
- Appointment configuration
- Preview
- Publish

## Phase 7 — Production

Build:

- Domain mapping
- HTTPS
- Backups
- Monitoring
- Security hardening
- Analytics
- Deployment pipeline

---

# 36. V1 DEFINITION OF DONE

The first real platform version is considered successful when a Super Admin can:

1. Log in
2. Create a doctor
3. Create a tenant
4. Select a website template
5. Enter doctor information
6. Upload branding/media
7. Add services
8. Edit the homepage using blocks
9. Change theme/colors/fonts
10. Configure appointment availability
11. Preview the website
12. Publish the website
13. Associate a domain
14. Manage appointments
15. Repeat the entire process for Doctor #2 without changing application code

That final point is critical.

---

# 37. CODING STANDARDS

Prefer:

- TypeScript strict mode
- Small reusable components
- Server-side authorization
- Schema validation
- Typed database access
- Clear service boundaries
- Reusable abstractions
- Explicit error handling
- Secure defaults
- Accessible UI
- Responsive design

Avoid:

- Hard-coded tenant content
- Hard-coded doctor data in components
- Copy/pasting entire websites
- Vendor lock-in
- Global mutable tenant state
- Trusting client-provided tenant IDs
- Secrets in source code
- Unvalidated file uploads
- Over-engineering without a requirement

---

# 38. IMPORTANT DEVELOPMENT RULE

Before adding a feature:

1. Understand the existing architecture.
2. Check whether the feature already exists.
3. Reuse existing abstractions.
4. Preserve tenant isolation.
5. Keep infrastructure replaceable.
6. Add tests for important business logic.
7. Do not break existing tenants.
8. Do not replace working architecture merely for stylistic reasons.

When making architectural changes, explain why they are necessary.

---

# 39. MADILU REQUIREMENT

Madilu Women's Health is the first tenant.

The intended visual direction is:

- Premium
- Modern
- Editorial
- Elegant
- Warm
- Doctor-led
- Trustworthy
- Strong appointment conversion

Possible visual direction:

- Deep teal/navy
- Ivory
- Muted rose
- Soft sage
- Editorial typography
- Large doctor imagery
- Generous whitespace
- Premium cards and sections

Do not invent doctor credentials or medical claims.

Placeholder content must be clearly identifiable and replaceable through CMS.

---

# 40. FINAL PRODUCT PRINCIPLE

The goal is NOT:

"Build a beautiful Madilu website."

The goal is:

"Build a reusable doctor website operating system, and prove it with Madilu."

Every major implementation decision should be evaluated against that objective.