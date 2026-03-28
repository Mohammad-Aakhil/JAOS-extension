# ATS URL Lists

One file per ATS platform. One URL per line. Lines starting with `#` are comments.

```
# ashby.txt
https://jobs.ashbyhq.com/company1/job-id-1/application
https://jobs.ashbyhq.com/company2/job-id-2/application
```

Usage:
```bash
node recon-batch.js --ats ashby --urls urls/ashby.txt
```
